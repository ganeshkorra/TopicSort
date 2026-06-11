import { _decorator, Component, Node, Vec3, EventTouch, UITransform, tween, Layout } from 'cc';
import { IconIdentity } from './IconIdentity';
const { ccclass, property } = _decorator;

interface MatchData {
    row: Node;
    family: string;
}

@ccclass('GameManager')
export class GameManager extends Component {

    @property(Node) public dragLayer: Node = null;
    @property([Node]) public allIcons: Node[] = [];
    
    @property([Node]) public rowNodes: Node[] = [];   
    @property([Node]) public labelNodes: Node[] = []; 

    @property({ tooltip: "Time for swap" }) public swapDuration: number = 0.6;
    @property({ tooltip: "Size of row in label" }) public fittedScale: number = 0.6; 
    @property({ tooltip: "Y offset inside label" }) public labelYOffset: number = -25; 

    private _draggedIcon: Node = null;
    private _originalParent: Node = null;
    private _startWorldPos: Vec3 = new Vec3();
    private _startSiblingIndex: number = 0;
    private _isSwapping: boolean = false;
    private _completedCount: number = 0;

    private _gridYSlots: number[] = [];
    private _activeRows: Node[] = [];
    
    // SEQUENTIAL QUEUE TRACKING
    private _matchQueue: MatchData[] = [];
    private _isRowFlying: boolean = false;

    start() {
        this.labelNodes.forEach(label => label.active = false);

        this.rowNodes.forEach(row => {
            this._gridYSlots.push(row.position.y);
            this._activeRows.push(row);
        });

        // Index 0 is BOTTOM of the grid
        this._gridYSlots.sort((a, b) => a - b);

        this.allIcons.forEach(icon => {
            icon.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
            icon.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
            icon.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
            icon.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        });
    }

    private onTouchStart(event: EventTouch) {
        if (this._isSwapping || this._isRowFlying) return;
        this._draggedIcon = event.target as Node;
        this._originalParent = this._draggedIcon.parent;
        this._startWorldPos.set(this._draggedIcon.worldPosition);
        this._startSiblingIndex = this._draggedIcon.getSiblingIndex();
        const wp = this._draggedIcon.worldPosition;
        this._draggedIcon.setParent(this.dragLayer);
        this._draggedIcon.setWorldPosition(wp);
    }

    private onTouchMove(event: EventTouch) {
        if (!this._draggedIcon || this._isSwapping) return;
        this._draggedIcon.setWorldPosition(new Vec3(event.getUILocation().x, event.getUILocation().y, 0));
    }

    private onTouchEnd(event: EventTouch) {
        if (!this._draggedIcon || this._isSwapping) return;
        const touchPos = event.getUILocation();
        let targetIcon: Node = null;

        for (let node of this.allIcons) {
            if (node === this._draggedIcon) continue;
            if (node.getComponent(UITransform).isHit(touchPos)) { targetIcon = node; break; }
        }

        if (targetIcon) { this.handleSwap(this._draggedIcon, targetIcon); }
        else { this.returnHome(); }
        this._draggedIcon = null;
    }

    private handleSwap(dragged: Node, target: Node) {
        this._isSwapping = true;
        const targetStartWP = new Vec3(target.worldPosition);
        const draggedReleaseWP = new Vec3(dragged.worldPosition);
        const targetOldParent = target.parent;
        const targetOldIndex = target.getSiblingIndex();

        target.setParent(this._originalParent);
        target.setSiblingIndex(this._startSiblingIndex);
        dragged.setParent(targetOldParent);
        dragged.setSiblingIndex(targetOldIndex);

        target.setWorldPosition(targetStartWP);
        dragged.setWorldPosition(draggedReleaseWP);

        tween(target).to(this.swapDuration, { worldPosition: this._startWorldPos }, { easing: 'expoOut' }).start();

        tween(dragged)
            .to(this.swapDuration + 0.1, { worldPosition: targetStartWP }, { easing: 'backOut' })
            .call(() => {
                this._isSwapping = false;
                this.checkAllPotentialMatches(); 
            })
            .start();
    }

    private returnHome() {
        this._isSwapping = true;
        const curWP = new Vec3(this._draggedIcon.worldPosition);
        this._draggedIcon.setParent(this._originalParent);
        this._draggedIcon.setSiblingIndex(this._startSiblingIndex);
        this._draggedIcon.setWorldPosition(curWP);
        tween(this._draggedIcon).to(this.swapDuration, { worldPosition: this._startWorldPos }, { easing: 'expoOut' }).call(() => { this._isSwapping = false; }).start();
    }

    // --- SEQUENTIAL FLYING LOGIC ---

    private checkAllPotentialMatches() {
        this._activeRows.forEach(rowNode => {
            const identities = rowNode.getComponentsInChildren(IconIdentity).filter(i => i.node.parent !== this.dragLayer);
            if (identities.length === 4) {
                const family = identities[0].familyID;
                if (family !== "" && identities.every(id => id.familyID === family)) {
                    
                    // Add to queue if not already there
                    const alreadyQueued = this._matchQueue.some(m => m.row === rowNode);
                    if (!alreadyQueued) {
                        this._matchQueue.push({ row: rowNode, family: family });
                    }
                }
            }
        });

        // Start the sequence if something is in the queue
        if (!this._isRowFlying && this._matchQueue.length > 0) {
            this.processMatchQueue();
        }
    }

    private processMatchQueue() {
        if (this._matchQueue.length === 0) {
            this._isRowFlying = false;
            return;
        }

        this._isRowFlying = true;
        const matchData = this._matchQueue.shift(); // Get the next one
        const finishedRow = matchData.row;
        const familyID = matchData.family;

        const targetLabel = this.labelNodes.find(lbl => lbl.getComponent(IconIdentity)?.familyID === familyID);

        if (targetLabel) {
            this._activeRows = this._activeRows.filter(r => r !== finishedRow);
            
            targetLabel.active = true;
            targetLabel.setSiblingIndex(this._completedCount); 
            this._completedCount++; 

            const layoutParent = targetLabel.parent.getComponent(Layout);
            if (layoutParent) layoutParent.updateLayout();

            finishedRow.getComponentsInChildren(IconIdentity).forEach(idScript => {
                idScript.node.off(Node.EventType.TOUCH_START);
                const idx = this.allIcons.indexOf(idScript.node);
                if(idx > -1) this.allIcons.splice(idx, 1);
            });

            this.scheduleOnce(() => {
                const flyTargetWP = new Vec3(targetLabel.worldPosition);
                flyTargetWP.y += this.labelYOffset;

                tween(finishedRow)
                    .to(0.8, { worldPosition: flyTargetWP, scale: new Vec3(this.fittedScale, this.fittedScale, 1) }, { easing: 'quintInOut' })
                    .call(() => {
                        // THIS ANIMATION IS DONE, MOVE TO NEXT
                        this.processMatchQueue();
                    })
                    .start();
                
                this.slideRemainingRowsDown();
            }, 0);
        }
    }

    private slideRemainingRowsDown() {
        this._activeRows.sort((a, b) => a.position.y - b.position.y);
        for (let i = 0; i < this._activeRows.length; i++) {
            const rowToMove = this._activeRows[i];
            const targetY = this._gridYSlots[i];
            if (Math.abs(rowToMove.position.y - targetY) > 5) {
                tween(rowToMove).to(0.5, { position: new Vec3(rowToMove.position.x, targetY, 0) }, { easing: 'expoOut' }).start();
            }
        }
    }
}