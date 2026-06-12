import { _decorator, Color, Component, EventTouch, Graphics, Label, Layout, Node, ProgressBar, tween, UITransform, UIOpacity, Vec2, Vec3 } from 'cc';
import { IconIdentity } from './IconIdentity';
import { Analytics, analyticsEvents } from './Analytics';
import { HandTutorialNode } from './HandTutorialNode';
const { ccclass, property } = _decorator;

interface MatchData {
    row: Node;
    family: string;
}

@ccclass('GameManager')
export class GameManager extends Component {

    @property(Node) public dragLayer: Node = null;
    @property(Node) public dropGlow: Node = null;
    @property(Node) public winCTA: Node = null;  // Win CTA screen
    @property(Node) public loseCTA: Node = null;  // Lose CTA screen
    @property(Node) public handTutorialNode: Node = null;  // Hand tutorial node
    @property(Node) public targetIconNode1: Node = null;  // First icon for hand tutorial
    @property(Node) public targetIconNode2: Node = null;  // Second icon for hand tutorial
   
    @property(Label) public movesCountLabel: Label = null;
    @property(Label) public matchesCountLabel: Label = null;
    @property(ProgressBar) public progressBar: ProgressBar = null;
    @property(Node) public progressFillNode: Node = null;
    @property([Node]) public allIcons: Node[] = [];
    
    @property([Node]) public rowNodes: Node[] = [];   
    @property([Node]) public labelNodes: Node[] = []; 

    @property({ tooltip: "Time for swap" }) public swapDuration: number = 0.6;
    @property({ tooltip: "Size of row in label" }) public fittedScale: number = 0.6; 
    @property({ tooltip: "Y offset inside label" }) public labelYOffset: number = -25; 
    @property({ tooltip: "How long match particle stays visible" }) public matchParticleDuration: number = 0.8;
    @property({ tooltip: "Moves shown at game start" }) public totalMoves: number = 40;
    @property({ tooltip: "Game time limit in seconds" }) public gameTimeLimit: number = 45;
    @property({ tooltip: "Time before idle hand hint appears (seconds)" }) public idleHintDelay: number = 7;
    @property({ tooltip: "Seconds to wait after confetti before showing win CTA" }) public winCtaDelay: number = 1.2;

    private _draggedIcon: Node = null;
    private _originalParent: Node = null;
    private _startWorldPos: Vec3 = new Vec3();
    private _startSiblingIndex: number = 0;
    private _isSwapping: boolean = false;
    private _completedCount: number = 0;
    private _moveCount: number = 0;
    private _displayedProgress: number = 0;
    private _gameTime: number = 0;  // Current game time in seconds
    private _isGameEnded: boolean = false;  // Prevent multiple end calls
    private _timerStarted: boolean = false;  // Timer starts on first swap
    private _tutorialActive: boolean = true;  // Hand tutorial is active
    private _timeSinceLastMove: number = 0;  // Time elapsed since last successful move
    private _idleHintTriggered: boolean = false;  // Idle hint has been shown

    private _gridYSlots: number[] = [];
    private _activeRows: Node[] = [];
    
    // SEQUENTIAL QUEUE TRACKING
    private _matchQueue: MatchData[] = [];
    private _isRowFlying: boolean = false;

    start() {
        this.labelNodes.forEach(label => label.active = false);
        this.hideDropGlow();
        
        // Hide CTA screens at start
        if (this.winCTA) this.winCTA.active = false;
        if (this.loseCTA) this.loseCTA.active = false;
      
        this.updateProgressUI();

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

        // Start hand tutorial if available
        this.playHandTutorial();
    }

    private onTouchStart(event: EventTouch) {
        // Stop tutorial on first player input
        if (this._tutorialActive) {
            this._tutorialActive = false;
            const handTutorial = this.handTutorialNode?.getComponent(HandTutorialNode);
            if (handTutorial) {
                handTutorial.stopTutorial();
            }
        }

        if (this._isSwapping || this._isRowFlying) return;
        this._draggedIcon = event.target as Node;
        this.hideDropGlow();
        this._originalParent = this._draggedIcon.parent;
        this._startWorldPos.set(this._draggedIcon.worldPosition);
        this._startSiblingIndex = this._draggedIcon.getSiblingIndex();
        const wp = this._draggedIcon.worldPosition;
        this._draggedIcon.setParent(this.dragLayer);
        this._draggedIcon.setWorldPosition(wp);
        this._draggedIcon.setSiblingIndex(this.dragLayer.children.length - 1);
    }

    private onTouchMove(event: EventTouch) {
        if (!this._draggedIcon || this._isSwapping) return;
        const touchPos = event.getUILocation();
        this._draggedIcon.setWorldPosition(new Vec3(touchPos.x, touchPos.y, 0));

        const targetIcon = this.findDropTarget(touchPos);
        if (targetIcon) {
            this.showDropGlow(targetIcon);
        } else {
            this.hideDropGlow();
        }
    }

    private onTouchEnd(event: EventTouch) {
        if (!this._draggedIcon || this._isSwapping) return;
        const touchPos = event.getUILocation();
        const targetIcon = this.findDropTarget(touchPos);

        this.hideDropGlow();
        if (targetIcon) { this.handleSwap(this._draggedIcon, targetIcon); }
        else { this.returnHome(); }
        this._draggedIcon = null;
    }

    private findDropTarget(touchPos: Vec2): Node {
        for (let node of this.allIcons) {
            if (node === this._draggedIcon) continue;

            const transform = node.getComponent(UITransform);
            if (transform && transform.isHit(touchPos)) {
                return node;
            }
        }

        return null;
    }

    private showDropGlow(target: Node) {
        if (!target || !this.dropGlow) return;

        this.dropGlow.active = true;
        this.dropGlow.setWorldPosition(target.worldPosition);

        if (this.dropGlow.parent === this.dragLayer) {
            this.dropGlow.setSiblingIndex(0);
            this._draggedIcon?.setSiblingIndex(this.dragLayer.children.length - 1);
        }
    }

    private hideDropGlow() {
        if (this.dropGlow) this.dropGlow.active = false;
    }

    private handleSwap(dragged: Node, target: Node) {
        this._isSwapping = true;
        
        // Start timer on first swap
        if (!this._timerStarted) {
            this._timerStarted = true;
        }
        
        // Count this move
        this.addMove();
        
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
            
            // Check win condition after all matches are processed
            this.scheduleOnce(() => {
                this.checkWinCondition();
            }, 0.5);
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
            this.updateProgressUI();

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

   
    private addMove() {
        this._moveCount++;
        this.updateProgressUI();
        
        // Reset idle hint timer on successful move
        this._timeSinceLastMove = 0;
        this._idleHintTriggered = false;
        
        // Check if player lost (moves exhausted)
        if (this._moveCount >= this.totalMoves && !this._isGameEnded) {
            this.scheduleOnce(() => {
                this.endGameLose();
            }, 0.5);
        }
    }

    update(deltaTime: number) {
        if (!this._timerStarted || this._isGameEnded) return;

        this._gameTime += deltaTime;

        // Check if time is up
        if (this._gameTime >= this.gameTimeLimit) {
            this.endGameLose();
        }

        // Track time since last move for idle hint
        this._timeSinceLastMove += deltaTime;
        if (this._timeSinceLastMove >= this.idleHintDelay && !this._idleHintTriggered) {
            this._idleHintTriggered = true;
            this.playIdleHandHint();
        }
    }

    private updateProgressUI() {
        const totalMatches = Math.max(this.rowNodes.length, 1);
        const targetProgress = Math.min(this._completedCount / totalMatches, 1);

        if (this.movesCountLabel) {
            const movesRemaining = Math.max(this.totalMoves - this._moveCount, 0);
            this.movesCountLabel.string = movesRemaining.toString();
        }

        if (this.matchesCountLabel) {
            this.matchesCountLabel.string = `${this._completedCount}/${totalMatches}`;
        }

        this.animateProgressTo(targetProgress);
    }

    private animateProgressTo(targetProgress: number) {
        if (Math.abs(targetProgress - this._displayedProgress) < 0.001) {
            this.setProgressVisual(targetProgress);
            return;
        }

        const progressState = { value: this._displayedProgress };
        tween(progressState)
            .to(0.35, { value: targetProgress }, {
                easing: 'quadOut',
                onUpdate: () => {
                    this.setProgressVisual(progressState.value);
                },
            })
            .call(() => {
                this._displayedProgress = targetProgress;
                this.setProgressVisual(targetProgress);
            })
            .start();
    }

    private setProgressVisual(progress: number) {
        if (this.progressFillNode) {
            const scale = this.progressFillNode.scale;
            this.progressFillNode.setScale(new Vec3(progress, scale.y, scale.z));
            return;
        }

        if (this.progressBar) {
            this.progressBar.progress = progress;
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

    private checkWinCondition() {
        const totalMatches = this.rowNodes.length;
        if (this._completedCount >= totalMatches && !this._isGameEnded) {
            this.endGameWin();
        }
    }

    private endGameWin() {
        if (this._isGameEnded) return;
        this._isGameEnded = true;

        // Disable all touch on icons
        this.allIcons.forEach(icon => {
            icon.off(Node.EventType.TOUCH_START);
            icon.off(Node.EventType.TOUCH_MOVE);
            icon.off(Node.EventType.TOUCH_END);
        });

        this.playConfettiBlast();
        this.scheduleOnce(() => {
            if (this.winCTA) {
                this.winCTA.active = true;
            }
        }, this.winCtaDelay);

        // Fire analytics
        if (Analytics.instance) {
            Analytics.instance.dispatchEvent(analyticsEvents.CHALLENGE_SOLVED);
        }

        console.log("🎉 GAME WON! All rows matched!");
    }

    private playConfettiBlast(): void {
        const parent = this.dragLayer || this.node;
        if (!parent) return;

        const colors = [
            new Color(255, 82, 82, 255),
            new Color(255, 214, 72, 255),
            new Color(77, 208, 225, 255),
            new Color(129, 199, 132, 255),
            new Color(186, 104, 200, 255),
        ];

        for (let i = 0; i < 104; i++) {
            const piece = new Node('RuntimeConfetti');
            parent.addChild(piece);
            piece.setWorldPosition(this.winCTA?.worldPosition || this.node.worldPosition);
            const startPosition = new Vec3(piece.position);

            const transform = piece.addComponent(UITransform);
            transform.setContentSize(80, 108);

            const opacity = piece.addComponent(UIOpacity);
            opacity.opacity = 255;

            const graphic = piece.addComponent(Graphics);
            graphic.fillColor = colors[i % colors.length];
            graphic.rect(-25, -39, 50, 78);
            graphic.fill();

            const angle = Math.random() * Math.PI * 2;
            const distance = 380 + Math.random() * 260;
            const targetPosition = new Vec3(
                startPosition.x + Math.cos(angle) * distance,
                startPosition.y + Math.sin(angle) * distance - 80,
                0
            );

            piece.angle = Math.random() * 360;

            tween(piece)
                .to(0.85 + Math.random() * 0.35, {
                    position: targetPosition,
                    angle: piece.angle + 240 + Math.random() * 360,
                    scale: new Vec3(0.35, 0.35, 1),
                }, { easing: 'quadOut' })
                .call(() => piece.destroy())
                .start();

            tween(opacity)
                .delay(0.45)
                .to(0.45, { opacity: 0 })
                .start();
        }
    }

    private endGameLose() {
        if (this._isGameEnded) return;
        this._isGameEnded = true;

        // Disable all touch on icons
        this.allIcons.forEach(icon => {
            icon.off(Node.EventType.TOUCH_START);
            icon.off(Node.EventType.TOUCH_MOVE);
            icon.off(Node.EventType.TOUCH_END);
        });

        // Show lose CTA screen
        if (this.loseCTA) {
            this.loseCTA.active = true;
        }

        // Fire analytics
        if (Analytics.instance) {
            Analytics.instance.dispatchEvent(analyticsEvents.CHALLENGE_FAILED);
        }

        const loseReason = this._gameTime >= this.gameTimeLimit ? "Time's up!" : "Out of moves!";
        console.log(`❌ GAME LOST! ${loseReason}`);
    }

    private playHandTutorial(): void {
        if (!this.handTutorialNode || !this.targetIconNode1 || !this.targetIconNode2) return;

        const handTutorial = this.handTutorialNode.getComponent(HandTutorialNode);
        if (!handTutorial) return;

        // Show drag tutorial between the two target icons
        handTutorial.playDragTutorial(this.targetIconNode1, this.targetIconNode2);
    }

    private playIdleHandHint(): void {
        if (!this.handTutorialNode || this.allIcons.length < 2) return;

        const handTutorial = this.handTutorialNode.getComponent(HandTutorialNode);
        if (!handTutorial) return;

        // Smart hint: show a real cross-row swap that helps complete the closest row.
        let bestIcon1: Node | null = null;
        let bestIcon2: Node | null = null;
        let bestScore: number = -1;

        // Analyze each active row to find which one is closest to matching
        this._activeRows.forEach(rowNode => {
            const identities = rowNode.getComponentsInChildren(IconIdentity).filter(i => i.node.parent !== this.dragLayer);
            
            // Count families in this row
            const familyCount: { [key: string]: number } = {};

            identities.forEach(idScript => {
                const family = idScript.familyID;
                familyCount[family] = (familyCount[family] || 0) + 1;
            });

            // Find family with most icons in this row (closest to match)
            Object.keys(familyCount).forEach(family => {
                const count = familyCount[family];
                
                // Score: prefer rows with 3 of same family (one swap away from match)
                // Then rows with 2 of same family (two swaps away)
                let score = count === 3 ? 100 : count === 2 ? 50 : 0;
                
                const sourceIcon = this.findIconInOtherRow(family, rowNode);
                const targetIcon = identities.find(idScript => idScript.familyID !== family)?.node || null;

                // Only show hints that drag from one row into another row.
                if (score > bestScore && sourceIcon && targetIcon) {
                    bestScore = score;
                    bestIcon1 = sourceIcon;
                    bestIcon2 = targetIcon;
                }
            });
        });

        // Fallback: if no smart match found, still demonstrate a cross-row drag.
        if (!bestIcon1 || !bestIcon2) {
            const fallback = this.findAnyCrossRowPair();
            bestIcon1 = fallback.start;
            bestIcon2 = fallback.end;
        }

        if (bestIcon1 && bestIcon2) {
            const hintType = bestScore === 100 ? "3 icons matching" : bestScore === 50 ? "2 icons matching" : "cross-row";
            console.log(`💡 Idle Hint: Showing cross-row drag (${hintType})`);
            handTutorial.playDragTutorial(bestIcon1, bestIcon2);
        }
    }

    private findIconInOtherRow(family: string, excludedRow: Node): Node | null {
        for (const rowNode of this._activeRows) {
            if (rowNode === excludedRow) continue;

            const icon = rowNode
                .getComponentsInChildren(IconIdentity)
                .find(idScript => idScript.node.parent !== this.dragLayer && idScript.familyID === family)?.node || null;

            if (icon) return icon;
        }

        return null;
    }

    private findAnyCrossRowPair(): { start: Node | null, end: Node | null } {
        for (const start of this.allIcons) {
            for (const end of this.allIcons) {
                if (start !== end && start.parent !== end.parent) {
                    return { start, end };
                }
            }
        }

        return { start: null, end: null };
    }
}
