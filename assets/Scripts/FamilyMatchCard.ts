import { _decorator, Component, Node, Vec3, EventTouch, UITransform, tween } from 'cc';
import { GameManager } from './GameManager';
import { IconIdentity } from './IconIdentity';
const { ccclass, property } = _decorator;

@ccclass('FamilyMatchCard')
export class FamilyMatchCard extends Component {

    @property([Node])
    public icons: Node[] = []; // Assigned in Inspector

    private _draggedIcon: Node = null;
    private _startWorldPos: Vec3 = new Vec3();
    private _startIndex: number = -1;

    start() {
        this.registerIcons();
    }

    // Refresh listeners (needed if we change icons array)
    private registerIcons() {
        this.icons.forEach(icon => {
            // Remove old listeners first to avoid duplicates
            icon.off(Node.EventType.TOUCH_START);
            icon.off(Node.EventType.TOUCH_MOVE);
            icon.off(Node.EventType.TOUCH_END);
            icon.off(Node.EventType.TOUCH_CANCEL);

            icon.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
            icon.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
            icon.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
            icon.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        });
    }

    private onTouchStart(event: EventTouch) {
        this._draggedIcon = event.target as Node;
        
        // Find which slot this icon was in within THIS row
        this._startIndex = this.icons.indexOf(this._draggedIcon);
        if (this._startIndex === -1) return;

        // Store world position so we can return here if drop fails
        this._startWorldPos.set(this._draggedIcon.worldPosition);

        // Move to Top Layer for dragging visibility
        const currentPos = this._draggedIcon.worldPosition;
        this._draggedIcon.setParent(GameManager.instance.dragLayer);
        this._draggedIcon.setWorldPosition(currentPos); 
    }

    private onTouchMove(event: EventTouch) {
        if (!this._draggedIcon) return;
        const touchPos = event.getUILocation();
        this._draggedIcon.setWorldPosition(new Vec3(touchPos.x, touchPos.y, 0));
    }

    private onTouchEnd(event: EventTouch) {
        if (!this._draggedIcon) return;

        const touchPos = event.getUILocation();
        let targetIcon: Node | null = null;
        let targetRow: FamilyMatchCard | null = null;

        // Find ALL FamilyMatchCard scripts in the game
        const canvas = this.node.parent; 
        const allRowScripts = canvas.getComponentsInChildren(FamilyMatchCard);

        // Check if touch released over ANY icon in ANY row
        for (let row of allRowScripts) {
            for (let icon of row.icons) {
                const uiTransform = icon.getComponent(UITransform);
                if (uiTransform && uiTransform.isHit(touchPos)) {
                    targetIcon = icon;
                    targetRow = row;
                    break;
                }
            }
        }

        if (targetIcon && targetIcon !== this._draggedIcon) {
            this.handleGlobalSwap(this._draggedIcon, targetIcon, targetRow);
        } else {
            this.returnToHome();
        }

        this._draggedIcon = null;
    }

    private handleGlobalSwap(dragged: Node, target: Node, targetRowComp: FamilyMatchCard) {
        const targetWorldPos = new Vec3(target.worldPosition);
        const targetIndex = targetRowComp.icons.indexOf(target);
        
        // 1. Data Swap (Update the arrays in both row scripts)
        // This ensures the new position is remembered permanently
        this.icons[this._startIndex] = target;
        targetRowComp.icons[targetIndex] = dragged;

        // 2. Hierarchy Swap (Move parents)
        const myRowNode = this.node;
        const targetRowNode = targetRowComp.node;

        target.setParent(myRowNode);
        target.setSiblingIndex(this._startIndex);

        dragged.setParent(targetRowNode);
        dragged.setSiblingIndex(targetIndex);

        // 3. Re-register listeners because ownership changed
        this.registerIcons();
        targetRowComp.registerIcons();

        // 4. Smooth Animations
        // Move Target Icon to Dragged Icon's old slot
        tween(target)
            .to(0.3, { worldPosition: this._startWorldPos }, { easing: 'sineOut' })
            .start();

        // Move Dragged Icon to Target Icon's slot
        tween(dragged)
            .to(0.3, { worldPosition: targetWorldPos }, { easing: 'backOut' })
            .call(() => {
                // Now that swap is finished, verify if rows match
                this.checkMatching(this);
                this.checkMatching(targetRowComp);
            })
            .start();
    }

    private returnToHome() {
        // Fail state: Return to the row it came from
        this._draggedIcon.setParent(this.node);
        this._draggedIcon.setSiblingIndex(this._startIndex);
        
        tween(this._draggedIcon)
            .to(0.2, { worldPosition: this._startWorldPos }, { easing: 'sineOut' })
            .start();
    }

    private checkMatching(rowComp: FamilyMatchCard) {
        if (rowComp.icons.length < 4) return;
        
        const firstID = rowComp.icons[0].getComponent(IconIdentity)?.familyID;
        if (!firstID) return;

        const isMatch = rowComp.icons.every(icon => {
            const identity = icon.getComponent(IconIdentity);
            return identity && identity.familyID === firstID;
        });

        if (isMatch) {
            console.log(`Success! All icons in ${rowComp.node.name} are family: ${firstID}`);
            // Add your particle effects or green glow here
        }
    }
}