using System.Collections.Generic;

namespace IdiomTower.Runtime.Core
{
    /// <summary>
    /// v0.6 Runtime GameLoop
    /// 负责串联：字系统 / Trie成语匹配 / 波次系统 / 玩家状态 / 技能执行
    /// </summary>
    public class GameLoop
    {
        private LetterPipeline letterPipeline;
        private IdiomTrie idiomTrie;
        private WaveManager waveManager;
        private PlayerState playerState;

        private List<string> currentInput = new List<string>();

        public GameLoop(
            LetterPipeline letterPipeline,
            IdiomTrie idiomTrie,
            WaveManager waveManager,
            PlayerState playerState)
        {
            this.letterPipeline = letterPipeline;
            this.idiomTrie = idiomTrie;
            this.waveManager = waveManager;
            this.playerState = playerState;
        }

        /// <summary>
        /// 每帧更新字系统 + 波次逻辑
        /// </summary>
        public void Update(float deltaTime)
        {
            letterPipeline?.Update(deltaTime);

            // 波次推进逻辑（简化版）
            if (waveManager != null)
            {
                waveManager.Tick(deltaTime);
            }
        }

        /// <summary>
        /// 玩家放置一个字
        /// </summary>
        public void OnLetterPlaced(string letter)
        {
            if (string.IsNullOrEmpty(letter)) return;

            currentInput.Add(letter);

            // 尝试匹配成语
            var recipe = idiomTrie?.Match(currentInput);

            if (recipe != null)
            {
                ExecuteIdiom(recipe);
                currentInput.Clear();
            }
        }

        /// <summary>
        /// 执行成语技能
        /// </summary>
        private void ExecuteIdiom(IdiomRecipe recipe)
        {
            float buff = 1f;

            if (playerState != null &&
                playerState.idiomBuffs != null &&
                playerState.idiomBuffs.ContainsKey(recipe.id))
            {
                buff = playerState.idiomBuffs[recipe.id];
            }

            SkillSystem.Execute(recipe, buff);
        }

        /// <summary>
        /// 进入下一波
        /// </summary>
        public void NextWave()
        {
            waveManager?.NextWave();
        }

        /// <summary>
        /// 重置输入缓存
        /// </summary>
        public void ResetInput()
        {
            currentInput.Clear();
        }
    }

    /// <summary>
    /// 简单技能系统占位（v0.6 runtime stub）
    /// </summary>
    public static class SkillSystem
    {
        public static void Execute(IdiomRecipe recipe, float multiplier)
        {
            // TODO: 接入真正战斗系统
            // 当前仅作为结构验证
            float finalPower = recipe.basePower * multiplier;

            UnityEngine.Debug.Log($"[Idiom] {recipe.id} triggered, power={finalPower}");
        }
    }

    /// <summary>
    /// 成语数据结构（运行时引用）
    /// </summary>
    public class IdiomRecipe
    {
        public string id;
        public List<string> pattern;
        public float basePower;
        public string type;
    }

    /// <summary>
    /// 波次管理器（简化运行版）
    /// </summary>
    public class WaveManager
    {
        public int wave = 1;
        private float timer;
        private float waveDuration = 30f;

        public void Tick(float dt)
        {
            timer += dt;

            if (timer >= waveDuration)
            {
                NextWave();
                timer = 0;
            }
        }

        public void NextWave()
        {
            wave++;
            UnityEngine.Debug.Log($"[Wave] Enter wave {wave}");
        }
    }

    /// <summary>
    /// 玩家状态（简化版）
    /// </summary>
    public class PlayerState
    {
        public Dictionary<string, float> idiomBuffs = new Dictionary<string, float>();
    }

    /// <summary>
    /// 字系统接口占位
    /// </summary>
    public class LetterPipeline
    {
        public void Update(float dt)
        {
            // TODO: bag + queue + pollution system
        }
    }

    /// <summary>
    /// Trie接口占位（依赖v0.5.2）
    /// </summary>
    public class IdiomTrie
    {
        public IdiomRecipe Match(List<string> input)
        {
            // TODO: real trie implementation
            return null;
        }
    }
}