import { Node, Color } from 'cc';
import { ViewSystem } from './ViewSystem';

type PatchedViewSystem = ViewSystem & {
    uiLayer?: Node | null;
    effectLayer?: Node | null;
    slots?: Array<{ node: Node; char: string; tile: any | null }>;
    tiles?: Array<any>;
    showTip?: (text: string) => void;
    createTile?: (char: string, index: number, x: number, y: number) => void;
    clearSlotsToHome?: () => void;
    createText?: (parent: Node | null, name: string, text: string, x: number, y: number, size: number, color: Color) => Node;
    createImageNode?: (parent: Node | null, name: string, resourcePaths: string[], x: number, y: number, w: number, h: number, fallbackText: string, fallbackFontSize: number) => Node;
    getTileTexture?: (char: string) => string;

    __rogueChars?: string[];
    __rogueUnlockedIdioms?: string[];
};

function installRoguelitePatch() {
    const proto = ViewSystem.prototype as any;
    if (proto.__roguelitePatch086) return;
    proto.__roguelitePatch086 = true;

    const oldGetTileTexture = proto.getTileTexture;
    proto.getTileTexture = function(char: string) {
        if (char === '百' || char === '步' || char === '穿' || char === '杨') return '';
        return oldGetTileTexture.call(this, char);
    };

    const oldCheckIdiom = proto.checkIdiom;
    proto.checkIdiom = function() {
        const self = this as PatchedViewSystem;
        const slots = self.slots ?? [];
        const text = slots.map(s => s.char).join('');
        if (text.length < 4) return;

        const unlocked = self.__rogueUnlockedIdioms ?? ['百步穿杨'];
        if (unlocked.includes(text)) {
            self.showTip?.(`已组成：${text}`);
            self.onIdiomComplete?.(text);
            self.clearSlotsToHome?.();
            return;
        }

        // 兼容旧系统默认三个成语。
        if (!self.__rogueUnlockedIdioms) {
            oldCheckIdiom.call(this);
            return;
        }

        self.showTip?.(`未解锁成语：${text}`);
    };

    proto.setRogueliteState = function(chars: string[], unlockedIdioms: string[]) {
        const self = this as PatchedViewSystem;
        self.__rogueChars = [...chars];
        self.__rogueUnlockedIdioms = [...unlockedIdioms];
        this.rebuildRogueliteTiles?.();
    };

    proto.rebuildRogueliteTiles = function() {
        const self = this as PatchedViewSystem;
        if (!self.uiLayer || !self.uiLayer.isValid || !self.createTile) return;

        const oldTiles = self.tiles ?? [];
        for (const tile of oldTiles) {
            if (tile?.node && tile.node.isValid) tile.node.destroy();
        }
        self.tiles = [];

        const slots = self.slots ?? [];
        for (const slot of slots) {
            slot.char = '';
            slot.tile = null;
        }

        const chars = self.__rogueChars && self.__rogueChars.length > 0
            ? self.__rogueChars
            : ['百', '步', '穿', '杨', '百', '步'];

        const gap = 86;
        const row1Y = -272;
        const row2Y = -348;
        const maxFirstRow = Math.min(7, chars.length);
        const row1Count = Math.min(maxFirstRow, chars.length);
        const row2Count = Math.max(0, chars.length - row1Count);
        const row1StartX = -((row1Count - 1) * gap) / 2;
        const row2StartX = -((row2Count - 1) * gap) / 2;

        for (let i = 0; i < chars.length; i++) {
            const row = i < row1Count ? 0 : 1;
            const col = row === 0 ? i : i - row1Count;
            const x = row === 0 ? row1StartX + col * gap : row2StartX + col * gap;
            const y = row === 0 ? row1Y : row2Y;
            self.createTile(chars[i], i, x, y);
        }
    };

    proto.showRogueliteHud = function(text: string) {
        const self = this as PatchedViewSystem;
        self.showTip?.(text);
    };
}

installRoguelitePatch();
