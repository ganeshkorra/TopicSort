import { _decorator, Component } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('IconIdentity')
export class IconIdentity extends Component {
    @property
    public familyID: string = ""; // Example: "food", "sports", "faces"
}