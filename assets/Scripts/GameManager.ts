import { _decorator, Component, Node, Vec3, EventTouch, UITransform, tween, Layout } from 'cc';
import { IconIdentity } from './IconIdentity';
const { ccclass, property } = _decorator;

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

    // Track grid positions manually since we aren't using a layout
    private _gridYPositions: number[] = [];
    private _activeRowNodes: Node[] = [];

    start() {
        this.labelNodes.forEach(label => label.active = false);

        // Store original Y positions of all rows at the start
        this.rowNodes.forEach(row => {
            this._gridYPositions.push(row.position.y);
            this._activeRowNodes.push(row);
        });

        this.allIcons.forEach(icon => {
            icon.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
            icon.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
            icon.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
            icon.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        });
    }

    private onTouchStart(event: EventTouch) {
        if (this._isSwapping) return;
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
            if (node.getComponent(UITransform).isHit(touchPos)) { 
                targetIcon = node; 
                break; 
            }
        }

        if (targetIcon) { this.handleSwap(this._draggedIcon, targetIcon); }
        else { this.returnHome(); }
        this._draggedIcon = null;
    }

    // ORIGINAL SLOW SWAP - UNTOUCHED
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
                this.checkMatching(); 
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

    // --- GRID SHIFTING LOGIC ---

    private checkMatching() {
        for (let i = 0; i < this._activeRowNodes.length; i++) {
            let rowNode = this._activeRowNodes[i];
            const identities = rowNode.getComponentsInChildren(IconIdentity).filter(ident => ident.node.parent !== this.dragLayer);
            
            if (identities.length === 4) {
                const family = identities[0].familyID;
                if (family !== "" && identities.every(id => id.familyID === family)) {
                    this.processGridMatch(rowNode, family);
                    return; // Process one match at a time for safety
                }
            }
        }
    }

    private processGridMatch(finishedRow: Node, familyID: string) {
        const targetLabel = this.labelNodes.find(lbl => lbl.getComponent(IconIdentity)?.familyID === familyID);

        if (targetLabel) {
            // 1. Remove this row from our "Smart Grid" tracking
            const rowIdx = this._activeRowNodes.indexOf(finishedRow);
            if (rowIdx > -1) this._activeRowNodes.splice(rowIdx, 1);

            // 2. Fly Row to Top Labels
            targetLabel.active = true;
            targetLabel.setSiblingIndex(this._completedCount); 
            this._completedCount++; 

            // Force label layout update
            const lblLayout = targetLabel.parent.getComponent(Layout);
            if (lblLayout) lblLayout.updateLayout();

            // Clear interactions for icons in this row
            finishedRow.getComponentsInChildren(IconIdentity).forEach(idScript => {
                idScript.node.off(Node.EventType.TOUCH_START);
                const iconIdx = this.allIcons.indexOf(idScript.node);
                if(iconIdx > -1) this.allIcons.splice(iconIdx, 1);
            });

            // FLY UP
            const destWP = new Vec3(targetLabel.worldPosition);
            destWP.y += this.labelYOffset;

            tween(finishedRow)
                .delay(0.2)
                .to(0.8, { worldPosition: destWP, scale: new Vec3(this.fittedScale, this.fittedScale, 1) }, { easing: 'quintInOut' })
                .start();

            // 3. SMART SHIFT: Move the remaining rows up to fill the gap
            this.shiftRowsToFillGaps();
        }
    }

    private shiftRowsToFillGaps() {
        // We move every active row to the next available "Highest" position in our Y-coordinate list
        for (let i = 0; i < this._activeRowNodes.length; i++) {
            const targetY = this._gridYPositions[i]; // Slot 1, then Slot 2, then Slot 3...
            const rowToMove = this._activeRowNodes[i];

            // Only move if the row isn't already there
            if (Math.abs(rowToMove.position.y - targetY) > 5) {
                tween(rowToMove)
                    .to(0.5, { position: new Vec3(rowToMove.position.x, targetY, 0) }, { easing: 'backOut' })
                    .start();
            }
        }
    }
}