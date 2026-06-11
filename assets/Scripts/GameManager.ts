import { _decorator, Component, Node, Vec3, EventTouch, UITransform, tween } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {

    @property(Node)
    public dragLayer: Node = null; // Drag your 'Draggedlayer' node here

    @property([Node])
    public allIcons: Node[] = []; // Drag ALL 16 icon nodes into this list

    private _draggedIcon: Node = null;
    private _originalParent: Node = null;
    private _startWorldPos: Vec3 = new Vec3();
    private _startSiblingIndex: number = 0;

    start() {
        // This attaches the drag script to every icon in your grid
        this.allIcons.forEach(icon => {
            icon.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
            icon.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
            icon.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
            icon.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        });
    }

    private onTouchStart(event: EventTouch) {
        this._draggedIcon = event.target as Node;
        
        // Save the start information (its Home)
        this._originalParent = this._draggedIcon.parent;
        this._startWorldPos.set(this._draggedIcon.worldPosition);
        this._startSiblingIndex = this._draggedIcon.getSiblingIndex();

        // Put icon on the TOP LAYER so it moves above all rows
        const wp = this._draggedIcon.worldPosition;
        this._draggedIcon.setParent(this.dragLayer);
        this._draggedIcon.setWorldPosition(wp);
    }

    private onTouchMove(event: EventTouch) {
        if (!this._draggedIcon) return;
        const touchPos = event.getUILocation();
        this._draggedIcon.setWorldPosition(new Vec3(touchPos.x, touchPos.y, 0));
    }

    private onTouchEnd(event: EventTouch) {
        if (!this._draggedIcon) return;

        const touchPos = event.getUILocation();
        let targetIcon: Node = null;

        // UNIVERSAL DETECTION: Loop through all 16 icons to see if we dropped on one
        for (let iconNode of this.allIcons) {
            if (iconNode === this._draggedIcon) continue; // Don't swap with self

            const ui = iconNode.getComponent(UITransform);
            if (ui && ui.isHit(touchPos)) {
                targetIcon = iconNode;
                break;
            }
        }

        if (targetIcon) {
            this.handleSwap(this._draggedIcon, targetIcon);
        } else {
            this.returnHome();
        }

        this._draggedIcon = null;
    }

    private handleSwap(dragged: Node, target: Node) {
        const targetOldParent = target.parent;
        const targetOldWorldPos = new Vec3(target.worldPosition);
        const targetOldIndex = target.getSiblingIndex();

        // 1. CHANGE HOMES (Physical Hierarchy Swap)
        // This makes the new position permanent
        target.setParent(this._originalParent);
        target.setSiblingIndex(this._startSiblingIndex);

        dragged.setParent(targetOldParent);
        dragged.setSiblingIndex(targetOldIndex);

        // 2. SWAP ANIMATION (Visuals)
        tween(target)
            .to(0.25, { worldPosition: this._startWorldPos }, { easing: 'sineOut' })
            .start();

        tween(dragged)
            .to(0.25, { worldPosition: targetOldWorldPos }, { easing: 'backOut' })
            .start();
            
        console.log("Swap Complete! New positions saved.");
    }

    private returnHome() {
        this._draggedIcon.setParent(this._originalParent);
        this._draggedIcon.setSiblingIndex(this._startSiblingIndex);
        
        tween(this._draggedIcon)
            .to(0.2, { worldPosition: this._startWorldPos }, { easing: 'sineOut' })
            .start();
    }
}