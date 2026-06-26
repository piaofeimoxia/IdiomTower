export type RunSummary = {
    result: 'victory' | 'failed';
    reason?: string;
    roomReached: number;
    killCount: number;
    castCount: number;
    strongestIdiom: string | null;
    remainingLife: number;
    rogueLevel?: number;
};
