# Degrading Systems Page Enhancements

## Overview
Enhanced the degrading systems page to provide clearer context, historical information, and better understanding of system health status changes.

## Key Improvements

### 1. **Tooltips for Better Understanding**
Added interactive tooltips throughout the interface to explain:

#### Health Status Tooltips
- **FULLY_HEALTHY**: "All 3 security tools (R7, Automox, Defender) are reporting. Health Score: 100%"
- **PARTIALLY_HEALTHY**: "Only 1-2 security tools are reporting. Health Score: 33%-67%"
- **UNHEALTHY**: "No security tools are reporting but system is active in Intune. Health Score: 0%"
- **INACTIVE**: "System has not checked into Intune for 15+ days or is not in Intune. Excluded from health calculations."

#### Stability Score Tooltips
Dynamic tooltips based on score ranges:
- **90-100**: "Excellent. System has been consistently healthy with minimal fluctuations."
- **70-89**: "Good. System is mostly stable with some minor variations."
- **50-69**: "Fair. System shows moderate instability or recent changes."
- **Below 50**: "Poor. System has significant instability or chronic issues."

#### Tool Status Tooltips
Each tool badge shows detailed information on hover:
- **R7**: "Rapid7 is currently reporting" or "Rapid7 is NOT reporting - vulnerability scanning may be offline"
- **Automox**: "Automox is currently reporting" or "Automox is NOT reporting - patch management may be offline"
- **Defender**: "Defender is currently reporting" or "Defender is NOT reporting - endpoint protection may be offline"
- **Intune**: "Intune is currently reporting" or "Intune is NOT reporting - system may be offline"

#### Recovery Status Tooltips
- **NORMAL_RECOVERY**: "System is recovering within expected timeframe (< 2 days)"
- **STUCK_RECOVERY**: "System recovery is taking longer than expected (> 3 days) - may need intervention"

### 2. **Historical Health Status Column (Degrading Systems Only)**
Added a new column specifically for degrading systems that shows:

#### Was Healthy Indicator
- ✅ Visual indicator if the system was previously healthy
- Shows "Last healthy: X days ago" with exact day count

#### Missing Tools Timeline
Detailed breakdown of which tools stopped reporting and when:
```
Stopped reporting:
• R7: 5 days ago
• Automox: 3 days ago
• Defender: 7 days ago
```

This helps identify:
- Which specific tools are causing the degradation
- How long each tool has been offline
- Patterns in tool failures

### 3. **Informational Banner for Degrading Systems**
Added a prominent banner at the top of the degrading systems page explaining:
- What degrading systems means
- What information is displayed in the table
- How to interpret the historical status
- Tips for using tooltips

Banner includes:
- 📉 Icon for visual identification
- Clear explanation of the page purpose
- Bulleted list of key features
- Helpful tip about hovering for more information

### 4. **Enhanced Table Headers with Info Icons**
Added info icons (ℹ️) next to column headers with explanatory tooltips:
- **Current Status**: "Current health status based on security tool reporting"
- **Historical Health**: "Shows if system was healthy before and when it degraded"

### 5. **Updated Classification Description**
Changed the degrading classification description from:
- **Old**: "Recently declined - investigate what changed"
- **New**: "Recently declined - shows what was healthy and what stopped reporting"

This makes it clearer that the page provides historical context.

### 6. **Visual Enhancements**

#### Custom Tooltip Styling
- Dark theme consistent with the application
- Fixed positioning that follows the cursor
- Maximum width for readability
- Subtle shadow for depth
- Monospace font for technical information

#### Info Banner Styling
- Distinct orange/degrading color scheme
- Left border accent
- Organized layout with icon and content
- Highlighted tip section with blue accent

#### Historical Status Cell Styling
- Green "Was Healthy" badge
- Monospace font for dates and numbers
- Red-accented section for missing tools
- Hierarchical information display

### 7. **Hover Effects**
Enhanced interactivity with hover effects on:
- Health status badges (scale and shadow)
- Stability scores (color change)
- Tool badges (scale and shadow)
- Recovery badges (scale and shadow)

All elements with tooltips have visual feedback on hover.

## Technical Implementation

### Files Modified

#### [`frontend/src/pages/AnalyticsDetailPage.tsx`](frontend/src/pages/AnalyticsDetailPage.tsx)
- Added `Tooltip` interface for tooltip state management
- Implemented `getHistoricalHealthStatus()` function to analyze health history
- Implemented `getDaysNotReporting()` function to track tool downtime
- Added `showTooltip()` and `hideTooltip()` handlers
- Created tooltip content generators for different status types
- Added conditional rendering for degrading systems column
- Implemented info banner component

#### [`frontend/src/pages/AnalyticsDetailPage.css`](frontend/src/pages/AnalyticsDetailPage.css)
- Added `.custom-tooltip` styles for tooltip display
- Added `.info-icon` styles for info icons
- Added `.info-banner` and related styles for the informational banner
- Added `.historical-status` and related styles for the new column
- Added `.missing-tools-info` styles for tool downtime display
- Enhanced hover effects for interactive elements
- Added responsive adjustments for new features

#### [`frontend/src/components/AnalyticsDashboard.tsx`](frontend/src/components/AnalyticsDashboard.tsx)
- Added info tooltip icon to degrading classification card
- Updated description text for better clarity

#### [`frontend/src/components/AnalyticsDashboard.css`](frontend/src/components/AnalyticsDashboard.css)
- Added `.info-tooltip` styles for dashboard tooltips

## User Benefits

### 1. **Clearer Understanding**
Users can now easily understand:
- What each health status means
- How stability scores are calculated
- Why a system is classified as degrading
- What "inactive" and "partially healthy" mean

### 2. **Better Troubleshooting**
The historical information helps users:
- Identify when problems started
- See which tools failed first
- Understand the progression of issues
- Prioritize remediation efforts

### 3. **Reduced Confusion**
Tooltips eliminate the need to:
- Reference external documentation
- Guess what metrics mean
- Wonder about scoring methodology
- Question classification logic

### 4. **Faster Decision Making**
With all context available on hover:
- No need to navigate away from the page
- Quick access to explanations
- Immediate understanding of severity
- Clear action indicators

## Usage Guide

### Viewing Degrading Systems
1. Navigate to Analytics Dashboard
2. Click on the "📉 Degrading" classification card
3. Review the informational banner at the top
4. Hover over any element with an info icon (ℹ️) for explanations

### Understanding Historical Status
For degrading systems, the "Historical Health" column shows:
- **✅ Was Healthy**: System was previously fully healthy
- **Last healthy: X days ago**: When the system was last healthy
- **Stopped reporting**: List of tools that stopped reporting with timelines

### Using Tooltips
Hover over any of these elements for detailed information:
- Health status badges
- Stability scores
- Tool status badges
- Recovery status badges
- Column headers with info icons

## Future Enhancements

Potential improvements for future iterations:
1. Add graphical timeline visualization of health changes
2. Include automated remediation suggestions
3. Add filtering by tool type (show only systems missing specific tools)
4. Implement export functionality for historical data
5. Add trend analysis showing if degradation is accelerating
6. Include correlation analysis between tool failures

## Testing Recommendations

To verify the enhancements:
1. Navigate to a degrading systems page
2. Verify the info banner displays correctly
3. Test all tooltips by hovering over elements
4. Check that historical health column shows for degrading systems only
5. Verify tool downtime calculations are accurate
6. Test responsive behavior on different screen sizes
7. Confirm hover effects work smoothly
8. Validate that tooltips don't overlap or obscure content

## Documentation References

For more information about the health scoring methodology, see:
- [`documentation/HEALTH-SCORING-METHODOLOGY.md`](documentation/HEALTH-SCORING-METHODOLOGY.md)

---

**Implementation Date**: January 30, 2026  
**Version**: 1.0  
**Status**: Ready for Testing
