import { _decorator, Component } from 'cc'; // Removed 'String' from here
const { ccclass, property } = _decorator;

@ccclass('IconIdentity')
export class IconIdentity extends Component {
    @property
    public familyID: string = ""; // No changes needed here, 'string' is built-in
}