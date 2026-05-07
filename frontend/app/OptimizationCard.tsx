import { motion } from 'framer-motion';

interface OptimizationStrategy {
  label: string;
  detail: string;
}

const OptimizationCard = () => {
  const strategies: OptimizationStrategy[] = [
    {
      label: 'Parallel execution',
      detail: 'std::async 5 indicators',
    },
    {
      label: 'Connection pooling',
      detail: 'CURL pool size 8',
    },
    {
      label: 'Thread-safe sync',
      detail: 'std::mutex guards',
    },
    {
      label: 'Regex patterns',
      detail: '4 patterns, early exit',
    },
    {
      label: 'Compiler flags',
      detail: '-O3 -march=native -flto',
    },
    {
      label: 'Memory efficiency',
      detail: 'Circular buffer 50-window',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35 }}
      className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-3 flex-1 min-h-0"
    >
      <h3 className="text-white/50 text-[9px] tracking-[0.2em] uppercase mb-2">
        C++ Optimization Strategies
      </h3>
      <div className="grid grid-cols-2 gap-2 min-h-[80px]">
        {strategies.map((strategy, i) => (
          <div
            key={i}
            className="bg-white/5 border border-white/10 rounded-lg p-2.5 hover:bg-white/10 hover:border-white/20 transition-all duration-200"
          >
            <div className="text-white/80 text-[11px] font-medium">{strategy.label}</div>
            <div className="text-white/40 text-[10px] mt-1">{strategy.detail}</div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

export default OptimizationCard;