import { Node, UITransform, Color, Graphics, Vec3 } from 'cc';

export class ViewSystem {

    private root: Node | null = null;

    init(root: Node) {
        this.root = root;
    }

    spawnEnemy(type: string, payload?: any) {
        if (!this.root) return;

        const node = new Node(`enemy_${type}`);

        const ui = node.addComponent(UITransform);
        ui.setContentSize(40, 40);

        const g = node.addComponent(Graphics);
        g.clear();

        // simple color per type
        let color = new Color(255, 0, 0);
        if (type === 'shield') color = new Color(0, 200, 255);
        if (type === 'cavalry') color = new Color(255, 200, 0);
        if (type === 'archer') color = new Color(0, 255, 0);

        g.fillColor = color;
        g.rect(-20, -20, 40, 40);
        g.fill();

        node.setPosition(new Vec3(-200 + Math.random() * 400, 100, 0));

        this.root.addChild(node);
    }

    spawnLetter(char: string) {
        if (!this.root) return;

        const node = new Node(`letter_${char}`);

        const ui = node.addComponent(UITransform);
        ui.setContentSize(30, 30);

        const g = node.addComponent(Graphics);
        g.clear();

        g.fillColor = new Color(255, 220, 120);
        g.rect(-15, -15, 30, 30);
        g.fill();

        node.setPosition(new Vec3(-150 + Math.random() * 300, -100, 0));

        this.root.addChild(node);
    }
}