import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.patches import FancyBboxPatch, ConnectionPatch
import numpy as np

# Create figure and axis
fig, ax = plt.subplots(1, 1, figsize=(16, 12))
ax.set_xlim(0, 16)
ax.set_ylim(0, 12)
ax.axis('off')

# Colors
aws_orange = '#FF9900'
aws_blue = '#232F3E'
light_blue = '#4A90E2'
light_green = '#7ED321'
light_orange = '#F5A623'
light_purple = '#9013FE'
light_gray = '#F8F9FA'

# Title
ax.text(8, 11.5, 'FRMF (Feature Request Management Framework)', 
        fontsize=20, fontweight='bold', ha='center', color=aws_blue)
ax.text(8, 11, 'Production-Ready Architecture - End-to-End AI Pipeline', 
        fontsize=14, ha='center', color='gray')

# 1. Customer Portal
portal = FancyBboxPatch((0.5, 9), 2.5, 1.5, boxstyle="round,pad=0.1", 
                       facecolor=light_blue, edgecolor=aws_blue, linewidth=2)
ax.add_patch(portal)
ax.text(1.75, 9.75, 'Customer Portal\n(FRMF UI)', fontsize=11, fontweight='bold', 
        ha='center', va='center', color='white')

# 2. API Gateway
api_gw = FancyBboxPatch((4, 9), 2.5, 1.5, boxstyle="round,pad=0.1", 
                       facecolor=aws_orange, edgecolor=aws_blue, linewidth=2)
ax.add_patch(api_gw)
ax.text(5.25, 9.75, 'API Gateway\n(/data POST)', fontsize=11, fontweight='bold', 
        ha='center', va='center', color='white')

# 3. Ingestion Lambda
ingestion = FancyBboxPatch((7.5, 9), 2.5, 1.5, boxstyle="round,pad=0.1", 
                          facecolor=light_orange, edgecolor=aws_blue, linewidth=2)
ax.add_patch(ingestion)
ax.text(8.75, 9.75, 'Ingestion Lambda\n(bt101-ingestion-alpha)', fontsize=10, fontweight='bold', 
        ha='center', va='center', color='white')

# 4. Raw Data Lake (S3)
raw_s3 = FancyBboxPatch((11, 9), 4, 1.5, boxstyle="round,pad=0.1", 
                       facecolor=light_green, edgecolor=aws_blue, linewidth=2)
ax.add_patch(raw_s3)
ax.text(13, 9.75, 'Raw Data Lake (S3)\nbt101-raw-data-alpha\nJSON Storage', fontsize=10, fontweight='bold', 
        ha='center', va='center', color='white')

# 5. S3 Event Trigger
ax.text(13, 8.2, 'S3 Event Trigger\n(ObjectCreated)', fontsize=9, ha='center', 
        style='italic', color=aws_blue)

# 6. Processing Lambda (Orchestrator)
processing = FancyBboxPatch((11, 6), 4, 1.5, boxstyle="round,pad=0.1", 
                           facecolor=light_purple, edgecolor=aws_blue, linewidth=2)
ax.add_patch(processing)
ax.text(13, 6.75, 'Processing Lambda\n(bt101-processing-alpha)\nOrchestrator', fontsize=10, fontweight='bold', 
        ha='center', va='center', color='white')

# 7. AI Classification Lambda
classification = FancyBboxPatch((1, 4), 4, 1.5, boxstyle="round,pad=0.1", 
                               facecolor='#E74C3C', edgecolor=aws_blue, linewidth=2)
ax.add_patch(classification)
ax.text(3, 4.75, 'AI Classification Lambda\n(bt101-claude-classification-alpha)\nClaude 3 Haiku', fontsize=9, fontweight='bold', 
        ha='center', va='center', color='white')

# 8. AI Deduplication Lambda
deduplication = FancyBboxPatch((6, 4), 4, 1.5, boxstyle="round,pad=0.1", 
                              facecolor='#8E44AD', edgecolor=aws_blue, linewidth=2)
ax.add_patch(deduplication)
ax.text(8, 4.75, 'AI Deduplication Lambda\n(bt101-claude-deduplication-alpha)\nSemantic Matching', fontsize=9, fontweight='bold', 
        ha='center', va='center', color='white')

# 9. Enhanced Data Lake (S3 Parquet)
parquet_s3 = FancyBboxPatch((11, 2), 4, 1.5, boxstyle="round,pad=0.1", 
                           facecolor='#27AE60', edgecolor=aws_blue, linewidth=2)
ax.add_patch(parquet_s3)
ax.text(13, 2.75, 'Enhanced Data Lake (S3)\nbt101-parquet-data-alpha\nParquet + AI Analysis', fontsize=9, fontweight='bold', 
        ha='center', va='center', color='white')

# Processing Flow Arrows
# Portal -> API Gateway
arrow1 = ConnectionPatch((3, 9.75), (4, 9.75), "data", "data", 
                        arrowstyle="->", shrinkA=5, shrinkB=5, mutation_scale=20, fc=aws_blue)
ax.add_patch(arrow1)

# API Gateway -> Ingestion Lambda
arrow2 = ConnectionPatch((6.5, 9.75), (7.5, 9.75), "data", "data", 
                        arrowstyle="->", shrinkA=5, shrinkB=5, mutation_scale=20, fc=aws_blue)
ax.add_patch(arrow2)

# Ingestion Lambda -> Raw S3
arrow3 = ConnectionPatch((10, 9.75), (11, 9.75), "data", "data", 
                        arrowstyle="->", shrinkA=5, shrinkB=5, mutation_scale=20, fc=aws_blue)
ax.add_patch(arrow3)

# Raw S3 -> Processing Lambda (S3 Event)
arrow4 = ConnectionPatch((13, 8.5), (13, 7.5), "data", "data", 
                        arrowstyle="->", shrinkA=5, shrinkB=5, mutation_scale=20, fc=aws_blue)
ax.add_patch(arrow4)

# Processing -> Classification
arrow5 = ConnectionPatch((11, 6.2), (5, 5.2), "data", "data", 
                        arrowstyle="->", shrinkA=5, shrinkB=5, mutation_scale=20, fc=aws_blue)
ax.add_patch(arrow5)

# Processing -> Deduplication
arrow6 = ConnectionPatch((11.5, 6), (9.5, 5.5), "data", "data", 
                        arrowstyle="->", shrinkA=5, shrinkB=5, mutation_scale=20, fc=aws_blue)
ax.add_patch(arrow6)

# Processing -> Parquet S3
arrow7 = ConnectionPatch((13, 6), (13, 3.5), "data", "data", 
                        arrowstyle="->", shrinkA=5, shrinkB=5, mutation_scale=20, fc=aws_blue)
ax.add_patch(arrow7)

# Processing Times
ax.text(1.75, 8.5, '~200ms', fontsize=8, ha='center', color='gray', style='italic')
ax.text(5.25, 8.5, '~100ms', fontsize=8, ha='center', color='gray', style='italic')
ax.text(8.75, 8.5, '~150ms', fontsize=8, ha='center', color='gray', style='italic')
ax.text(3, 3.5, '~3.2s', fontsize=8, ha='center', color='gray', style='italic')
ax.text(8, 3.5, '~2.4s', fontsize=8, ha='center', color='gray', style='italic')
ax.text(13, 1.5, '~200ms', fontsize=8, ha='center', color='gray', style='italic')

# Key Features Box
features_box = FancyBboxPatch((0.5, 0.2), 6, 1.2, boxstyle="round,pad=0.1", 
                             facecolor=light_gray, edgecolor=aws_blue, linewidth=1)
ax.add_patch(features_box)
ax.text(3.5, 1, '🎯 Key Features', fontsize=12, fontweight='bold', ha='center', color=aws_blue)
ax.text(3.5, 0.6, '• AI-Powered Classification & Forecasting\n• Semantic Duplicate Detection (90% accuracy)\n• Complete Audit Trail & Legal Compliance', 
        fontsize=9, ha='center', va='center', color=aws_blue)

# Performance Box
perf_box = FancyBboxPatch((7.5, 0.2), 7.5, 1.2, boxstyle="round,pad=0.1", 
                         facecolor=light_gray, edgecolor=aws_blue, linewidth=1)
ax.add_patch(perf_box)
ax.text(11.25, 1, '⚡ Performance Metrics', fontsize=12, fontweight='bold', ha='center', color=aws_blue)
ax.text(11.25, 0.6, '• End-to-End Processing: ~7 seconds\n• 25+ AI-Enhanced Fields Generated\n• Production-Ready Serverless Architecture', 
        fontsize=9, ha='center', va='center', color=aws_blue)

plt.tight_layout()
plt.savefig('/home/rajeshpc/workplace/BT101-clean/FRMF_Architecture_Diagram.png', 
            dpi=300, bbox_inches='tight', facecolor='white', edgecolor='none')
plt.show()

print("✅ FRMF Architecture Diagram saved as: FRMF_Architecture_Diagram.png")
print("📊 Diagram shows complete production-ready pipeline with all Lambda functions and data flow")