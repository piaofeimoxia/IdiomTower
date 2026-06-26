export type RewardRarity = 'common' | 'rare' | 'epic' | 'gold';

export type RogueliteRewardOption = {
    id: string;
    rarity: RewardRarity;
    title: string;
    desc: string;
};
