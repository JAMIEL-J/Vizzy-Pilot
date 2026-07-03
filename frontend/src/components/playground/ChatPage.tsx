import { useState } from 'react';
import { 
  Terminal, Sparkles, Send, CheckCircle, HelpCircle, 
  Code2, Play, RefreshCw, BarChart2, Eye, ShieldAlert, ArrowUpRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
  chart?: 'bar' | 'donut' | null;
  suggestions?: string[];
  duration?: string;
}

export default function ChatPage({ isDark }: { isDark: boolean }) {
  // Pre-loaded conversation simulation to demonstrate Vizzy Pilot analytics!
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'user',
      content: "Compare the total revenue and orders of Enterprise vs Mid-Market customers across NA and EU."
    },
    {
      role: 'assistant',
      content: "I've synthesized the comparison metrics. Mapped columns: `Revenue` (metric), `Orders` (metric), `Customer Segment` (categorical). Applied filters: `Region` is NA or EU. Custom query compiled successfully in 55ms.",
      sql: `SELECT 
  t.customer_segment,
  SUM(t.revenue) AS total_revenue,
  COUNT(DISTINCT t.order_id) AS total_orders
FROM global_transactions t
WHERE t.customer_region IN ('North America', 'Europe')
  AND t.customer_segment IN ('Enterprise', 'Mid-Market')
GROUP BY t.customer_segment
ORDER BY total_revenue DESC;`,
      chart: 'bar',
      duration: '55ms',
      suggestions: [
        "How is customer churn split by contract type for these segments?",
        "Filter this breakdown to only look at Multi-Year contracts",
        "Add Software category filter to this query comparison"
      ]
    }
  ]);

  const [inputVal, setInputVal] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Suggested quick prompts
  const quickPrompts = [
    "What is the average order value by product category?",
    "Show me the growth trend over the last 4 weeks",
    "List transactions with price outliers exceeding IQR"
  ];

  const handleSend = (text: string) => {
    if (!text.trim()) return;
    
    // User message
    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInputVal('');
    setIsTyping(true);

    // Simulate agent response after 1.4s
    setTimeout(() => {
      let reply: Message;
      const lower = text.toLowerCase();

      if (lower.includes('churn') || lower.includes('contract')) {
        reply = {
          role: 'assistant',
          content: "Parsed intent: `Customer Churn` (metric) grouped by `Contract Type` (categorical) matching Enterprise and Mid-Market segment locks. Compiled query using optimized cache in 42ms.",
          sql: `SELECT 
  t.contract_type,
  AVG(t.churn_rate) * 100 AS average_churn_percentage,
  COUNT(t.customer_id) AS active_contract_count
FROM global_transactions t
WHERE t.customer_segment IN ('Enterprise', 'Mid-Market')
GROUP BY t.contract_type;`,
          chart: 'donut',
          duration: '42ms',
          suggestions: [
            "Show raw data grid for monthly contract churned users",
            "What is the revenue impact of monthly contract churn?"
          ]
        };
      } else if (lower.includes('outlier') || lower.includes('iqr')) {
        reply = {
          role: 'assistant',
          content: "Detected intent: Query transactional outlier rows. Mapped filter constraints: values exceeding 1.5 * IQR limit on the `Revenue` column. Evaluated in 68ms.",
          sql: `SELECT 
  t.order_id,
  t.customer_region,
  t.revenue,
  t.profit_margin
FROM global_transactions t
WHERE t.revenue > 15000.00
ORDER BY t.revenue DESC;`,
          chart: null,
          duration: '68ms',
          suggestions: [
            "Apply IQR Cap treatment to these rows",
            "Are these outliers correlated with specific categories?"
          ]
        };
      } else {
        reply = {
          role: 'assistant',
          content: `Processed query: "${text}". Mapped columns dynamically. Route selected: Cache warm hit in 52ms.`,
          sql: `SELECT 
  t.product_category,
  SUM(t.revenue) AS revenue,
  AVG(t.profit_margin) AS avg_margin
FROM global_transactions t
GROUP BY t.product_category;`,
          chart: 'bar',
          duration: '52ms',
          suggestions: [
            "Compare this against the raw v1 dataset",
            "Show database table column classification schema"
          ]
        };
      }

      setMessages(prev => [...prev, reply]);
      setIsTyping(false);
    }, 1400);
  };

  return (
    <div className="bg-bg text-text-custom font-sans flex flex-col relative pb-6 w-full min-h-[600px] text-left">
      
      {/* 1. Page Header */}
      <div className="border-b border-border-custom bg-surface/50 backdrop-blur-md sticky top-0 z-25">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 gap-4">
          
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-surface-2 rounded-xl border border-border-custom flex items-center justify-center">
              <Terminal className="w-5 h-5 text-accent-custom" />
            </div>
            <div>
              <div className="flex items-center space-x-2 text-[10px] text-muted-custom font-sans">
                <span>Apps</span>
                <span>/</span>
                <span>Workspace</span>
                <span>/</span>
                <span className="text-accent-custom">SQL Chat Portal</span>
              </div>
              <h1 className="text-sm font-semibold tracking-tight">SQL Chat Portal</h1>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-xs font-sans text-muted-custom">
            <span className="w-2 h-2 rounded-full bg-success-custom animate-pulse"></span>
            <span>Agent Active</span>
            <span className="hidden md:inline-block border-l border-border-custom pl-3">
              Route: Semantic Engine
            </span>
          </div>

        </div>
      </div>

      {/* Main Grid: Chat Stream and Artifact Explorer */}
      <div className="p-4 flex-1 flex flex-col">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-1 min-h-[500px]">
          
          {/* LEFT PANEL: Chat Portal Message Log */}
          <div className="lg:col-span-7 flex flex-col bg-surface border border-border-custom rounded-2xl shadow-xs overflow-hidden h-[600px] justify-between">
            
            {/* Header banner */}
            <div className="bg-surface-2 px-4 py-2.5 border-b border-border-custom flex items-center justify-between text-xs font-sans">
              <span className="text-muted-custom">Session ID: local-chat-x09</span>
              <span className="text-accent-custom font-semibold">Vizzy Pilot v2</span>
            </div>

            {/* Message Thread */}
            <div className="p-4 flex-1 overflow-y-auto space-y-4 max-h-[460px]">
              {messages.map((msg, i) => (
                <div 
                  key={i} 
                  className={`flex flex-col space-y-1.5 ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  {/* Sender label */}
                  <span className="text-[10px] font-sans text-muted-custom px-1.5">
                    {msg.role === 'user' ? 'You' : 'Vizzy Pilot Agent'}
                  </span>

                  {/* Message bubble card */}
                  <div 
                    className={`p-3.5 rounded-2xl text-xs max-w-[85%] leading-relaxed ${
                      msg.role === 'user' 
                        ? 'bg-accent-custom text-white font-medium rounded-tr-xs shadow-xs' 
                        : 'bg-surface-2 border border-border-custom text-text-custom rounded-tl-xs'
                    }`}
                  >
                    {msg.content}
                    
                    {msg.duration && (
                      <div className="mt-1.5 text-[9px] text-muted-custom font-mono flex items-center space-x-1 justify-end">
                        <CheckCircle className="w-2.5 h-2.5 text-success-custom" />
                        <span>Execution time: {msg.duration}</span>
                      </div>
                    )}
                  </div>

                  {/* Bubble Quick Actions (Suggestions) */}
                  {msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1.5 max-w-[85%]">
                      {msg.suggestions.map((sug, sidx) => (
                        <button
                          key={sidx}
                          onClick={() => handleSend(sug)}
                          className="px-2.5 py-1 bg-surface border border-border-custom hover:bg-surface-2 text-text-custom text-[10px] font-medium rounded-lg transition-all cursor-pointer text-left border-none"
                        >
                          {sug} &rarr;
                        </button>
                      ))}
                    </div>
                  )}

                </div>
              ))}

              {isTyping && (
                <div className="flex flex-col items-start space-y-1.5">
                  <span className="text-[10px] font-sans text-muted-custom px-1.5">Vizzy Pilot Agent</span>
                  <div className="bg-surface-2 border border-border-custom p-3.5 rounded-2xl rounded-tl-xs flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 bg-muted-custom rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-muted-custom rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-muted-custom rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              )}
            </div>

            {/* Message Input Panel */}
            <div className="p-4 border-t border-border-custom bg-surface flex flex-col space-y-2">
              
              {/* Optional Quick prompts list */}
              {messages.length === 1 && !isTyping && (
                <div className="flex flex-wrap gap-1.5 pb-2 border-b border-border-custom/50 mb-1.5">
                  {quickPrompts.map((qp, qidx) => (
                    <button
                      key={qidx}
                      onClick={() => handleSend(qp)}
                      className="px-2 py-1 bg-surface-2 hover:bg-border-custom/30 text-muted-custom hover:text-text-custom text-[10px] rounded-lg transition-all cursor-pointer border-none"
                    >
                      {qp}
                    </button>
                  ))}
                </div>
              )}

              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend(inputVal);
                }} 
                className="flex items-center space-x-2"
              >
                <input 
                  type="text" 
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  placeholder="Ask a question or compare segments..."
                  className="flex-1 bg-surface-2 border border-border-custom rounded-xl px-3.5 py-2 text-xs text-text-custom font-sans focus:outline-none focus:border-accent-custom transition-colors"
                />
                <button 
                  type="submit"
                  disabled={!inputVal.trim() || isTyping}
                  className="p-2 bg-accent-custom hover:opacity-90 disabled:opacity-40 text-white rounded-xl cursor-pointer transition-all border-none flex items-center justify-center shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>

          </div>

          {/* RIGHT PANEL: Live Compiled SQL & Charts Explorer */}
          <div className="lg:col-span-5 bg-surface border border-border-custom rounded-2xl shadow-xs overflow-hidden flex flex-col h-[600px] justify-between text-left">
            
            {/* Header banner */}
            <div className="bg-surface-2 px-4 py-2.5 border-b border-border-custom flex items-center justify-between text-xs font-sans">
              <span className="text-muted-custom flex items-center space-x-1">
                <Code2 className="w-3.5 h-3.5" />
                <span>Compiler Output Explorer</span>
              </span>
              <span className="text-[10px] text-success-custom bg-success-custom/10 px-1.5 py-0.5 rounded border border-success-custom/20 font-bold uppercase">
                Synchronized
              </span>
            </div>

            {/* Compiler contents */}
            <div className="p-4 flex-1 overflow-y-auto space-y-5">
              
              {/* 1. Compiled SQL Code Panel */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-sans">
                  <span className="font-semibold text-text-custom">Compiled SQL Statement</span>
                  <span className="text-[10px] text-muted-custom font-mono">ANSI-SQL 2025</span>
                </div>
                <div className="bg-surface-2 border border-border-custom rounded-xl p-3 font-mono text-[10.5px] text-[#A3A3A3] overflow-x-auto select-all leading-relaxed whitespace-pre">
                  {messages[messages.length - 1]?.sql || `/* No query compiled yet. Send a prompt to resolve. */`}
                </div>
              </div>

              {/* 2. Live Chart Component Viewer */}
              {messages[messages.length - 1]?.chart && (
                <div className="space-y-2 border-t border-border-custom/50 pt-4 animate-fade-in text-left">
                  
                  <div className="flex items-center justify-between text-xs font-sans">
                    <span className="font-semibold text-text-custom flex items-center space-x-1">
                      <BarChart2 className="w-3.5 h-3.5 text-accent-custom" />
                      <span>Live Visual Render</span>
                    </span>
                    <span className="text-[10px] text-[#7D9BBA] font-semibold">Teal Mint / Dusty Blue</span>
                  </div>

                  <div className="bg-surface-2/40 border border-border-custom rounded-xl p-4 flex flex-col items-center justify-center min-h-[140px] relative">
                    
                    {messages[messages.length - 1]?.chart === 'bar' && (
                      <div className="w-full space-y-4">
                        
                        {/* Enterprise bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-sans">
                            <span className="font-semibold text-text-custom">Enterprise Segment (Sales x Volume)</span>
                            <span className="text-muted-custom font-semibold">$1.35M</span>
                          </div>
                          <div className="w-full h-2.5 bg-border-custom/40 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: '85%' }}
                              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                              className="h-full bg-accent-custom rounded-full"
                            />
                          </div>
                        </div>

                        {/* Mid-Market bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-sans">
                            <span className="font-semibold text-text-custom">Mid-Market Segment</span>
                            <span className="text-muted-custom font-semibold font-mono">$760K</span>
                          </div>
                          <div className="w-full h-2.5 bg-border-custom/40 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: '48%' }}
                              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                              className="h-full bg-[#7D9BBA] rounded-full"
                            />
                          </div>
                        </div>

                      </div>
                    )}

                    {messages[messages.length - 1]?.chart === 'donut' && (
                      <div className="flex items-center justify-around w-full">
                        <div className="relative w-20 h-20">
                          <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                            <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#2DD4BF" strokeWidth="4.5" strokeDasharray="75 25" />
                            <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#0D9488" strokeWidth="4.5" strokeDasharray="25 75" strokeDashoffset="-75" />
                          </svg>
                        </div>
                        <div className="space-y-1.5 text-[9px] font-sans">
                          <div className="flex items-center space-x-1.5"><span className="w-2 h-2 rounded-full bg-[#2DD4BF]"></span><span>Enterprise Churn: 1.4%</span></div>
                          <div className="flex items-center space-x-1.5"><span className="w-2 h-2 rounded-full bg-[#0D9488]"></span><span>Mid-Market Churn: 2.8%</span></div>
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              )}

            </div>

            {/* Bottom audit bar */}
            <div className="border-t border-border-custom p-4 bg-surface-2/30 text-left font-sans text-xs">
              <div className="flex items-center justify-between text-muted-custom text-[11px] mb-2">
                <span>Optimizer: Token Stream Cache</span>
                <span>Active filters locked: 2</span>
              </div>
              <div className="bg-surface border border-border-custom/60 rounded-xl p-2.5 text-[10.5px] text-muted-custom flex items-center space-x-2">
                <Play className="w-3.5 h-3.5 text-accent-custom animate-pulse" />
                <span>Compiler optimized execution chain dynamically mapping database indices.</span>
              </div>
            </div>

          </div>

        </div>
      </div>

    </div>
  );
}
