import { _decorator, Component, Node, Vec3, EventTouch, UITransform, tween } from 'cc';
import { IconIdentity } from './IconIdentity';
const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {

    @property(Node) public dragLayer: Node = null;
    @property([Node]) public allIcons: Node[] = [];
    
    @property([Node]) public rowNodes: Node[] = [];   
    @property([Node]) public labelNodes: Node[] = []; 

    @property({ tooltip: "Time for swap" }) public swapDuration: number = 0.6;
    @property({ tooltip: "Scale size of row when fitted in label" }) public fittedScale: number = 2;

    private _draggedIcon: Node = null;
    private _originalParent: Node = null;
    private _startWorldPos: Vec3 = new Vec3();
    private _startSiblingIndex: number = 0;
    private _isSwapping: boolean = false;

    start() {
        this.labelNodes.forEach(label => label.active = false);

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

    // THIS IS THE ORIGINAL SLOW SWAP YOU APPROVED
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

        // Slow smooth animation
        tween(target)
            .to(this.swapDuration, { worldPosition: this._startWorldPos }, { easing: 'expoOut' })
            .start();

        tween(dragged)
            .to(this.swapDuration + 0.1, { worldPosition: targetStartWP }, { easing: 'backOut' })
            .call(() => {
                this._isSwapping = false;
                this.checkMatching(); // Check completion
            })
            .start();
    }

    private returnHome() {
        this._isSwapping = true;
        const curWP = new Vec3(this._draggedIcon.worldPosition);
        this._draggedIcon.setParent(this._originalParent);
        this._draggedIcon.setSiblingIndex(this._startSiblingIndex);
        this._draggedIcon.setWorldPosition(curWP);

        tween(this._draggedIcon)
            .to(this.swapDuration, { worldPosition: this._startWorldPos }, { easing: 'expoOut' })
            .call(() => { this._isSwapping = false; })
            .start();
    }

    // --- MATCHING AND RESIZING LOGIC ---

    private checkMatching() {
        this.rowNodes.forEach(rowNode => {
            // Find icons using identity script within the row
            const identities = rowNode.getComponentsInChildren(IconIdentity).filter(i => i.node.parent !== this.dragLayer);
            
            if (identities.length === 4) {
                const family = identities[0].familyID;
                const isMatch = identities.every(id => id.familyID === family);

                if (isMatch && family !== "") {
                    this.flyAndScaleRow(rowNode, family);
                }
            }
        });
    }

    private flyAndScaleRow(row: Node, familyID: string) {
        // Find label by identity
        const targetLabel = this.labelNodes.find(lbl => lbl.getComponent(IconIdentity)?.familyID === familyID);

        if (targetLabel && row.active) {
            targetLabel.active = true;

            // Remove icons from interactions
            const childIdentities = row.getComponentsInChildren(IconIdentity);
            childIdentities.forEach(idScript => {
                idScript.node.off(Node.EventType.TOUCH_START);
                const idx = this.allIcons.indexOf(idScript.node);
                if(idx > -1) this.allIcons.splice(idx, 1);
            });

            // FLY AND RESIZE ANIMATION
            const destWP = targetLabel.worldPosition;
            // Target specific offset to fit inside label background
            const finalPos = new Vec3(destWP.x, destWP.y - 25 , 0); 

            tween(row)
                .delay(0.2)
                .to(0.8, { 
                    worldPosition: finalPos, 
                    scale: new Vec3(this.fittedScale, this.fittedScale, 1) 
                }, { easing: 'quintInOut' })
                .call(() => {
                    // Small pop to finish
                    tween(row).to(0.1, { scale: new Vec3(this.fittedScale + 0.05, this.fittedScale + 0.05, 1) })
                             .to(0.1, { scale: new Vec3(this.fittedScale, this.fittedScale, 1) }).start();
                })
                .start();
        }
    }
}