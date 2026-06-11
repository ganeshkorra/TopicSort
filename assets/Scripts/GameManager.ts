import { _decorator, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {
    public static instance: GameManager = null;
    @property(Node) public dragLayer: Node = null; 

    onLoad() { GameManager.instance = this; }
}