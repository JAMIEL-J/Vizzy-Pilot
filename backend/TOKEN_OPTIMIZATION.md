# Token Optimization Guide for Free Tier APIs

## 🎯 Problem

Free tier API limits are strict:
- **Gemini Flash Free**: 15 RPM (requests per minute), 1 million TPM (tokens per minute)
- **Gemini Pro Free**: 2 RPM, 32K TPM
- **Groq Free**: 30 RPM, 14.4K TPM

Academic use quickly hits these limits!

## ✅ Solutions Implemented

### 1. **Use Gemini Flash Instead of Pro**

**Change made**: Default model switched to `gemini-1.5-flash`

**Savings**: 
- ✅ Flash is **FREE** (no cost per token)
- ✅ 7.5x higher rate limit (15 RPM vs 2 RPM)
- ✅ Faster responses (lower latency)

**Trade-off**: Slightly less capable than Pro, but good enough for most tasks.

### 2. **Limit Response Length**

**Setting**: `LLM_MAX_TOKENS=512`

**What it does**: Limits the LLM's response to 512 tokens (~400 words)

**Savings**: Up to **75% reduction** in output tokens (default is 2048)

**Adjust**: 
- For shorter answers: `LLM_MAX_TOKENS=256`
- For longer explanations: `LLM_MAX_TOKENS=1024`

### 3. **Limit Input Context**

**Setting**: `LLM_MAX_INPUT_TOKENS=1024`

**What it does**: Truncates data sent to LLM to 1024 tokens

**Savings**: Up to **75% reduction** in input tokens

**How**: Uses `sample_dataframe()` to send only 50 rows instead of entire dataset

### 4. **Response Caching**

**Setting**: `LLM_ENABLE_CACHING=true`

**What it does**: Caches LLM responses for 1 hour

**Savings**: **100% reduction** for repeat queries

**Example**: 
- First query: "What is total revenue?" → API call
- Same query within 1 hour → Cached (no API call!)

### 5. **Data Sampling**

**Settings**:
- `LLM_MAX_ROWS_SAMPLE=50` - Only send 50 rows
- `LLM_MAX_COLUMNS_DESCRIBE=10` - Only describe 10 columns

**What it does**: Sends summary instead of full dataset

**Savings**: **90%+ reduction** for large datasets

**Example**:
```python
# Before: Send entire dataset (1000 rows × 50 cols = lots of tokens)
df.to_dict()  # ❌ Expensive

# After: Send sample (50 rows × 10 cols = much less)
optimize_data_for_llm(df)  # ✅ Cheap
```

### 6. **Lower Temperature**

**Setting**: `LLM_TEMPERATURE=0.3`

**What it does**: Makes responses more focused and deterministic

**Savings**: More concise responses = fewer output tokens

### 7. **Reduced Retries**

**Setting**: `LLM_MAX_RETRIES=2` (down from 3)

**What it does**: Retries failed requests only twice

**Savings**: **33% reduction** in retry overhead

---

## 📊 Total Estimated Savings

For a typical query analyzing a 1000-row dataset:

| Metric | Before | After | Savings |
|--------|--------|-------|---------|
| **Input tokens** | ~10,000 | ~1,000 | **90%** |
| **Output tokens** | ~1,500 | ~500 | **67%** |
| **Cache hits** | 0% | 50%+ | **50%+** |
| **Total tokens/query** | ~11,500 | ~750 | **93%** |

**Result**: You can make **~13x more queries** with the same token budget!

---

## 🛠️ How to Adjust for Your Needs

### For Shorter Responses (Save more tokens)

```env
LLM_MAX_TOKENS=256              # Even shorter responses
LLM_MAX_INPUT_TOKENS=512        # Less context
LLM_MAX_ROWS_SAMPLE=25          # Smaller sample
LLM_TEMPERATURE=0.2             # More focused
```

### For Better Quality (Use more tokens)

```env
LLM_MAX_TOKENS=1024             # Longer explanations
LLM_MAX_INPUT_TOKENS=2048       # More context
LLM_MAX_ROWS_SAMPLE=100         # Larger sample
LLM_GEMINI_MODEL=gemini-3.1-flash-lite # Optimized low-latency agentic model
```

### For Maximum Savings (Extreme mode)

```env
LLM_MAX_TOKENS=128              # Very short
LLM_MAX_INPUT_TOKENS=256        # Minimal context
LLM_MAX_ROWS_SAMPLE=20          # Tiny sample
LLM_CACHE_TTL_SECONDS=7200      # Cache for 2 hours
```

---

## 📈 Monitoring Token Usage

### Check Cache Performance

```python
from app.services.llm.token_optimizer import get_cache_stats

stats = get_cache_stats()
print(f"Cache hit rate: {stats['valid_entries'] / stats['total_entries'] * 100:.1f}%")
```

### Track API Calls

Check your API provider dashboard:
- **Gemini**: https://aistudio.google.com/app/apikey (quota usage)
- **Groq**: https://console.groq.com (usage metrics)

---

## 🎓 Academic Use Best Practices

1. **Use caching aggressively** - Great for demos and testing
2. **Start with small samples** - Test with 50 rows before scaling
3. **Use Flash, not Pro** - Free tier Flash is perfect for academic work
4. **Batch your testing** - Don't hit rate limits by spacing out requests
5. **Clear cache between major changes** - Fresh start for new experiments

---

## ⚠️ Common Issues & Solutions

### "Rate limit exceeded"

**Solution**: You're hitting the RPM limit. Either:
- Wait 1 minute between requests
- Switch to Gemini Flash (higher limit)
- Use caching to reduce API calls

### "Responses are too short"

**Solution**: Increase `LLM_MAX_TOKENS`:
```env
LLM_MAX_TOKENS=768  # or 1024
```

### "Not enough context for accurate answers"

**Solution**: Increase sample size:
```env
LLM_MAX_ROWS_SAMPLE=100
LLM_MAX_COLUMNS_DESCRIBE=15
```

### "Cache not working"

**Check**:
1. `LLM_ENABLE_CACHING=true` is set
2. Queries are identical (caching is exact match)
3. Cache hasn't expired (default 1 hour)

---

## 🚀 Quick Start

1. **Update your `.env`** (already done!)
2. **Restart backend**: `python -m uvicorn app.main:app --reload`
3. **Test a query** in Streamlit
4. **Check savings** - You should see much faster responses and fewer API calls

---

## 📚 Additional Resources

- [Gemini API Quotas](https://ai.google.dev/pricing)
- [Groq Rate Limits](https://console.groq.com/docs/rate-limits)
- [Token Counting Guide](https://platform.openai.com/tokenizer)

---

## 💡 Pro Tips

1. **Gemini Flash is underrated** - It's fast, free, and good enough for 95% of use cases
2. **Cache = Gold** - A 50% cache hit rate = 2x your effective quota
3. **Sample smart** - 50 rows is enough to understand most datasets
4. **Temperature matters** - Lower = shorter, more focused responses
5. **Monitor your usage** - Check your API dashboard regularly

**You're now optimized for free tier academic use!** 🎉
