import { Node, UITransform, Color, Graphics, Label } from 'cc';
import { ViewSystem } from './ViewSystem';

type PatchedViewSystem = ViewSystem & {
    effectLayer?: Node | null;
    uiLayer?: Node | null;
    __rogueFailRoot?: Node | null;
};

function createPanel(parent: Node, name: string, x: number, y: number, w: number, h: number, color: Color, stroke: Color, radius = 18) {
    const node = new Node(name);
    parent.addChild(node);
    node.setPosition(x, y, 0);
    node.addComponent(UITransform).setContentSize(w, h);
    const g = node.addComponent(Graphics);
    g.fillColor = color;
    g.roundRect(-w / 2, -h / 2, w, h, radius);
    g.fill();
    g.strokeColor = stroke;
    g.lineWidth = 3;
    g.roundRect(-w / 2, -h / 2, w, h, radius);
    g.stroke();
    return node;
}

function createText(parent: Node, name: string, text: string, x: number, y: number, w: number, h: number, fontSize: number, color: Color) {
    const node = new Node(name);
    parent.addChild(node);
    node.setPosition(x, y, 0);
    node.addComponent(UITransform).setContentSize(w, h);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 8;
    label.color = color;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.enableWrapText = true;
    label.overflow = Label.Overflow.SHRINK;
    return node;
}

function installGameOverPatch() {
    const proto = ViewSystem.prototype as any;
    if (proto.__rogueGameOverPatch0862) return;
    proto.__rogueGameOverPatch0862 = true;

    proto.showRunFailedPanel = function(reason: string, killCount: number, level: number, onRetry?: () => void) {
        const self = this as PatchedViewSystem;
        const parent = self.effectLayer ?? self.uiLayer;
        if (!parent || !parent.isValid) return;

        if (self.__rogueFailRoot && self.__rogueFailRoot.isValid) {
            self.__rogueFailRoot.destroy();
        }

        const root = new Node('roguelite_fail_root_v0862');
        parent.addChild(root);
        root.setPosition(0, 0, 0);
        root.addComponent(UITransform).setContentSize(1280, 720);
        self.__rogueFailRoot = root;

        createPanel(root, 'fail_panel', 0, 8, 620, 300, new Color(34, 28, 32, 250), new Color(255, 150, 130, 170), 20);
        createText(root, 'fail_title', '城门被破', 0, 100, 540, 48, 36, new Color(255, 190, 170, 255));
        createText(root, 'fail_reason', reason, 0, 54, 540, 36, 21, new Color(230, 220, 210, 255));
        createText(root, 'fail_stat', `击杀：${killCount}    等级：Lv.${level}`, 0, 15, 540, 30, 22, new Color(255, 232, 170, 255));
        createText(root, 'fail_hint', '失败后战斗已暂停，点击下方按钮重新开始本局', 0, -28, 540, 30, 18, new Color(190, 210, 225, 255));

        const retry = createPanel(root, 'retry_btn', 0, -92, 190, 54, new Color(96, 62, 58, 245), new Color(255, 205, 160, 150), 14);
        createText(retry, 'retry_text', '重新开始', 0, 0, 170, 34, 24, Color.WHITE);

        const retryAction = () => {
            if (self.__rogueFailRoot && self.__rogueFailRoot.isValid) {
                self.__rogueFailRoot.destroy();
            }
            self.__rogueFailRoot = null;
            onRetry?.();
        };

        retry.on(Node.EventType.TOUCH_END, retryAction, self);
        retry.on(Node.EventType.MOUSE_UP, retryAction, self);
    };
}

installGameOverPatch();
