import { SystemManager } from './SystemManager';

type PatchedSystemManager = SystemManager & {
    availableCharPool: string[];
    battleBag: string[];
    discardCooldown: number;
    discardCooldownMax: number;
    refillTimer: number;
    rewardPaused: boolean;
    gameOver: boolean;
    viewSystem: any;
    refreshRogueliteTiles?: () => void;
    __delayedDiscardChars?: string[];
};

function installBagCyclePatch() {
    const proto = SystemManager.prototype as any;
    if (proto.__bagCyclePatch08633) return;
    proto.__bagCyclePatch08633 = true;

    const oldResetRogueliteBuild = proto.resetRogueliteBuild;

    proto.buildRogueLevelConfig = function() {
        return {
            name: 'v0.8.6.3.3_bag_cycle_wave',
            totalEnemies: 180,
            spawnInterval: 1.45,
            enemyTypes: [
                'basic', 'basic', 'basic', 'basic', 'basic',
                'basic', 'basic', 'basic', 'basic', 'basic',
                'shield', 'basic', 'basic', 'cavalry', 'basic', 'archer',
            ],
        };
    };

    proto.resetRogueliteBuild = function() {
        const self = this as PatchedSystemManager;
        self.__delayedDiscardChars = [];
        oldResetRogueliteBuild.call(this);
    };

    /**
     * v0.8.6.3.3：弃字进入“延迟回池区”。
     *
     * 弃掉的字不会立刻放回 availableCharPool，避免刚弃掉又马上刷回来。
     * 只有当字池里的其它字都补入过战斗袋，也就是 availableCharPool 清空后，
     * 延迟区的弃字才会重新进入下一轮字池循环。
     */
    proto.discardLeftChar = function() {
        const self = this as PatchedSystemManager;
        if (self.gameOver || self.rewardPaused) return;

        if (self.discardCooldown > 0) {
            self.viewSystem.showTip(`弃字冷却中：${Math.ceil(self.discardCooldown)} 秒`);
            return;
        }

        if (!self.battleBag || self.battleBag.length <= 0) {
            self.viewSystem.showTip('当前没有可弃字');
            return;
        }

        const ch = self.battleBag.shift();
        if (!self.__delayedDiscardChars) self.__delayedDiscardChars = [];
        if (ch) self.__delayedDiscardChars.push(ch);

        self.discardCooldown = self.discardCooldownMax;
        self.refillTimer = 0;
        self.refreshRogueliteTiles?.();
        self.viewSystem.showTip(`已弃左侧字「${ch}」，本轮其它字出现完后才会回到字池`);
    };

    proto.drawPseudoRandomCharFromPool = function() {
        const self = this as PatchedSystemManager;
        if (!self.availableCharPool) self.availableCharPool = [];
        if (!self.__delayedDiscardChars) self.__delayedDiscardChars = [];

        // 当前轮字池已空，才把弃字放回下一轮。
        if (self.availableCharPool.length <= 0 && self.__delayedDiscardChars.length > 0) {
            self.availableCharPool.push(...self.__delayedDiscardChars);
            self.__delayedDiscardChars.length = 0;
        }

        if (self.availableCharPool.length <= 0) return '';

        const recent = (self.battleBag ?? []).slice(-2);
        const candidates = self.availableCharPool
            .map((ch, index) => ({ ch, index }))
            .filter(item => !(recent.length >= 2 && recent[0] === item.ch && recent[1] === item.ch));
        const pool = candidates.length > 0
            ? candidates
            : self.availableCharPool.map((ch, index) => ({ ch, index }));

        const picked = pool[Math.floor(Math.random() * pool.length)];
        self.availableCharPool.splice(picked.index, 1);
        return picked.ch;
    };
}

installBagCyclePatch();
