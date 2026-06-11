import { _decorator, Component, Node, Vec3, EventTouch, UITransform, tween, isValid } from 'cc';
import { IconIdentity } from './IconIdentity';
const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {

    @property(Node)
    public dragLayer: Node = null; // The 'Draggedlayer' node (at bottom of hierarchy)

    @property([Node])
    public allIcons: Node[] = []; // Drag all 16 icons from hierarchy into this list

    private _draggedIcon: Node = null;
    private _originalParent: Node = null;
    private _startWorldPos: Vec3 = new Vec3();
    private _startSiblingIndex: number = 0;
    private _isSwapping: boolean = false;

    start() {
        // Setup all icons with touch listeners
        this.allIcons.forEach(icon => {
            if (!icon) return;
            icon.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
            icon.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
            icon.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
            icon.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        });
    }

    private onTouchStart(event: EventTouch) {
        if (this._isSwapping) return;

        this._draggedIcon = event.target as Node;
        
        // Save Home data
        this._originalParent = this._draggedIcon.parent;
        this._startWorldPos.set(this._draggedIcon.worldPosition);
        this._startSiblingIndex = this._draggedIcon.getSiblingIndex();

        // 1. Capture current position, then move to Top Layer
        const currentWP = this._draggedIcon.worldPosition;
        this._draggedIcon.setParent(this.dragLayer);
        
        // 2. Prevent the "flicker" by re-setting world pos after parenting
        this._draggedIcon.setWorldPosition(currentWP);
    }

    private onTouchMove(event: EventTouch) {
        if (!this._draggedIcon || this._isSwapping) return;
        
        const touchPos = event.getUILocation();
        this._draggedIcon.setWorldPosition(new Vec3(touchPos.x, touchPos.y, 0));
    }

    private onTouchEnd(event: EventTouch) {
        if (!this._draggedIcon || this._isSwapping) return;

        const touchPos = event.getUILocation();
        let targetIcon: Node = null;

        // Detection logic: Check if released over another icon
        for (let node of this.allIcons) {
            if (node === this._draggedIcon) continue;

            const ui = node.getComponent(UITransform);
            if (ui && ui.isHit(touchPos)) {
                targetIcon = node;
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
        this._isSwapping = true;

        // 1. Pre-swap state capture
        const targetStartWP = new Vec3(target.worldPosition);
        const draggedReleaseWP = new Vec3(dragged.worldPosition);
        
        const targetParent = target.parent;
        const targetIndex = target.getSiblingIndex();

        // 2. The Logic Swap (Exchange positions in the hierarchy)
        // This ensures the "home" is updated permanently
        target.setParent(this._originalParent);
        target.setSiblingIndex(this._startSiblingIndex);

        dragged.setParent(targetParent);
        dragged.setSiblingIndex(targetIndex);

        // 3. Stabilization: Lock them to their visuals before animating
        target.setWorldPosition(targetStartWP);
        dragged.setWorldPosition(draggedReleaseWP);

        // 4. Smooth Premium Animations
        // The Target card glides to the start point
        tween(target)
            .to(0.6, { worldPosition: this._startWorldPos }, { easing: 'quintOut' })
            .start();

        // The Dragged card glides into the target slot with a nice "back" effect
        tween(dragged)
            .to(0.8, { worldPosition: targetStartWP }, { easing: 'backOut' })
            .call(() => {
                this._isSwapping = false;
                this.checkMatchingProgress(); // Check for rows matching
            })
            .start();
    }

    private returnHome() {
        this._isSwapping = true;
        
        const currentWP = new Vec3(this._draggedIcon.worldPosition);
        
        this._draggedIcon.setParent(this._originalParent);
        this._draggedIcon.setSiblingIndex(this._startSiblingIndex);
        
        // Prevent flicker
        this._draggedIcon.setWorldPosition(currentWP);

        tween(this._draggedIcon)
            .to(0.25, { worldPosition: this._startWorldPos }, { easing: 'sineOut' })
            .call(() => { this._isSwapping = false; })
            .start();
    }

    private checkMatchingProgress() {
        // Look at the children of each row and check if they have the same family ID
        // This iterates through the hierarchy as it currently stands
        const rows = this.dragLayer.parent.children.filter(n => n.name.toLowerCase().includes("row"));

        rows.forEach(row => {
            if (row.children.length === 0) return;
            
            const firstChildID = row.children[0].getComponent(IconIdentity)?.familyID;
            if (!firstChildID) return;

            let matchCount = 0;
            row.children.forEach(icon => {
                if (icon.getComponent(IconIdentity)?.familyID === firstChildID) {
                    matchCount++;
                }
            });

            if (matchCount === row.children.length) {
                console.log(`Success: Row ${row.name} is fully sorted!`);
                // You can add a visual success effect here (like glowing)
            }
        });
    }
}