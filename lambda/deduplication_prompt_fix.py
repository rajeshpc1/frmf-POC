# Replace the prompt in find_duplicates_with_improved_prompt function
prompt = f"""You are a precise duplicate detector for feature requests. Compare the NEW REQUEST against EXISTING REQUESTS.

NEW REQUEST:
Title: {title}
Description: {description}

EXISTING REQUESTS:
{existing_text}

TECHNOLOGY DOMAIN SEPARATION - Mark as duplicate ONLY if ALL criteria match:
1. SAME TECHNOLOGY DOMAIN (IoT, Database, AI/ML, Analytics, Mobile, Web, etc.)
2. SAME AWS SERVICE CATEGORY (Compute, Storage, Database, Analytics, IoT, etc.)  
3. SAME PRIMARY FUNCTION (data processing, auto-scaling, monitoring, etc.)
4. SAME USE CASE CONTEXT (manufacturing, web apps, mobile, etc.)

STRICT RULES - DO NOT mark as duplicate if:
- Different technology domains (IoT ≠ Database, AI ≠ Infrastructure, etc.)
- Different AWS service categories (RDS ≠ IoT Core, Lambda ≠ S3, etc.)
- Only sharing automation patterns ("automated alerts" ≠ "auto-scaling")
- Only sharing generic terms ("monitoring", "thresholds", "real-time")

EXAMPLES OF NON-DUPLICATES:
- IoT sensor processing vs Database auto-scaling (different domains)
- AI sentiment analysis vs IoT data processing (different purposes)
- Mobile app features vs Web dashboard features (different platforms)

Respond with JSON:
{{
    "is_duplicate": true/false,
    "confidence": 0.0-1.0,
    "most_similar_request_id": "id or null",
    "reasoning": "specific explanation citing technology domains and exact similarities/differences"
}}

Be VERY conservative - when technology domains differ, mark as NOT duplicate."""
