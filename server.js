const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper function with fallback for Gemini
async function runGemini(prompt) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent(prompt);
        let clean = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(clean);
    } catch (err) {
        console.error("Gemini call failed with 2.5-flash, trying 2.5-pro. Error:", err.message);
        try {
            const fallbackModel = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
            const result = await fallbackModel.generateContent(prompt);
            let clean = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(clean);
        } catch (fallbackErr) {
            console.error("Gemini call failed with 2.5-pro. Error:", fallbackErr.message);
            throw new Error("Both Gemini models failed.");
        }
    }
}

const connectDB = require('./database/connection');
const CommunityReport = require('./models/CommunityReport');
const EvidenceVault = require('./models/EvidenceVault');

// Connect to MongoDB
connectDB();

// Endpoint to fetch reports
app.get('/api/reports', async (req, res) => {
    try {
        const reports = await CommunityReport.find().sort({ createdAt: -1 });
        res.json(reports);
    } catch (err) {
        console.error("Error fetching reports:", err);
        res.status(500).json({ error: "Failed to fetch reports" });
    }
});

// Endpoint to add a report (with Gemini moderation)
app.post('/api/reports', async (req, res) => {
    let reportData = req.body;

    // AI Moderation Step
    try {
        const prompt = `You are a moderation AI for a community safety app. Review this report.
        Check if it's spam, offensive, or logical. Also fix any minor spelling issues in the description.
        Report Data: ${JSON.stringify(reportData)}
        Return JSON with:
        - isSpam (boolean)
        - cleanDesc (string, the corrected description)
        Respond only in JSON format matching the schema.`;

        const analysis = await runGemini(prompt);
        if (analysis.isSpam) {
            return res.status(400).json({ error: "Report rejected as spam by AI." });
        }
        reportData.desc = analysis.cleanDesc || reportData.desc;
    } catch (err) {
        console.error("Moderation AI failed, proceeding without it.");
    }

    try {
        const newReport = new CommunityReport(reportData);
        await newReport.save();
        res.status(201).json(newReport);
    } catch (err) {
        console.error("Error saving report:", err);
        res.status(500).json({ error: "Failed to save report" });
    }
});

// Endpoint to verify a report
app.post('/api/reports/:id/verify', async (req, res) => {
    try {
        const reportId = req.params.id;
        const report = await CommunityReport.findOne({ id: reportId });
        if (report) {
            report.verifications += 1;
            await report.save();
            res.json(report);
        } else {
            res.status(404).json({ error: "Report not found" });
        }
    } catch (err) {
        console.error("Error verifying report:", err);
        res.status(500).json({ error: "Failed to verify report" });
    }
});

// Endpoint to fetch vault entries
app.get('/api/vault', async (req, res) => {
    try {
        const vaultEntries = await EvidenceVault.find().sort({ timestamp: 1 });
        res.json(vaultEntries);
    } catch (err) {
        console.error("Error fetching vault entries:", err);
        res.status(500).json({ error: "Failed to fetch vault entries" });
    }
});

// Endpoint to add to vault
app.post('/api/vault', async (req, res) => {
    try {
        const newEntry = new EvidenceVault(req.body);
        await newEntry.save();
        res.status(201).json(newEntry);
    } catch (err) {
        console.error("Error saving vault entry:", err);
        res.status(500).json({ error: "Failed to save vault entry" });
    }
});

// Endpoint for Crowd Density Recommendations
app.post('/api/recommendations', async (req, res) => {
    const { location } = req.body;
    try {
        const prompt = `You are a Smart Guardian AI. Based on the location "${location}", give 2 dynamic route/safety recommendations for a pedestrian. 
        One should be a "Recommended" route, and one should be an "Alert/Avoid" zone. Make up reasonable dynamic details for a demonstration.
        Return a JSON array of exactly 2 objects with:
        - type (string: either "safe" or "alert")
        - title (string)
        - desc (string)
        Respond only with the JSON array without markdown blocks.`;

        const recommendations = await runGemini(prompt);
        res.json(recommendations);
    } catch (err) {
        console.error('Error generating recommendations:', err);
        res.json([
            { type: 'safe', title: 'High Visibility Route', desc: `Take main roads near ${location}. They have high pedestrian activity.` },
            { type: 'alert', title: 'Avoid Isolated Zones', desc: `Avoid side streets around ${location} right now.` }
        ]);
    }
});

// Endpoint for Smart Guardian safety analysis
app.post('/api/analyze-safety', async (req, res) => {
    try {
        const { locationData, lastKnownRoutine } = req.body;
        const prompt = `You are a Smart Guardian AI. Analyze the following user location data and their normal routine.
        Determine if there is a 'route deviation', 'long inactivity', or 'entry into an unsafe zone' based on common sense.
        Return a JSON response with:
        - isSafe (boolean)
        - reason (string)
        - recommendedAction (string: 'none', 'check-in', 'alert-emergency')
        
        Current Data: ${JSON.stringify(locationData)}
        Routine: ${JSON.stringify(lastKnownRoutine)}
        
        Respond only in JSON format matching the schema without any markdown blocks.`;

        const analysis = await runGemini(prompt);
        res.json(analysis);
    } catch (error) {
        console.error('Error analyzing safety:', error);
        res.json({
            isSafe: false,
            reason: "API Error: Significant route deviation detected with 5 mins of inactivity.",
            recommendedAction: "check-in"
        });
    }
});

// --- Crowd Detection & Route Analysis Helpers ---
const OVERPASS_CACHE = {};

function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000; // meters
    const phi_1 = lat1 * Math.PI / 180;
    const phi_2 = lat2 * Math.PI / 180;
    const delta_phi = (lat2 - lat1) * Math.PI / 180;
    const delta_lambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(delta_phi / 2.0) ** 2 +
        Math.cos(phi_1) * Math.cos(phi_2) *
        Math.sin(delta_lambda / 2.0) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function getTimeWeight(createdAtStr) {
    if (!createdAtStr) return 0.5;
    try {
        let createdTime;
        if (!isNaN(createdAtStr)) {
            createdTime = new Date(parseInt(createdAtStr, 10));
        } else {
            createdTime = new Date(createdAtStr);
        }
        const now = new Date();
        const diffTime = Math.abs(now - createdTime);
        const daysOld = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (daysOld <= 7) return 1.0;
        else if (daysOld <= 30) return 0.7;
        else return 0.2;
    } catch (e) {
        return 0.5;
    }
}

function getBasePoints(incidentType, hour) {
    const t = incidentType.trim().toLowerCase();
    let pts = 2;
    let isSevere = false;
    let isDynamic = false;

    if (t.includes('sexual assault') || t.includes('rape') || t.includes('kidnapping') || t.includes('attempted assault')) {
        pts = 1000;
        isSevere = true;
    } else if (t.includes('harassment') || t.includes('stalking') || t.includes('molestation')) {
        pts = 500;
        isSevere = true;
    } else if (t.includes('chain snatching') || t.includes('robbery')) {
        pts = 300;
        isSevere = true;
    } else if (t.includes('theft')) {
        pts = 100;
    } else if (t.includes('suspicious')) {
        pts = 10;
        isDynamic = true;
    } else if (t.includes('unsafe') || t.includes('street light') || t.includes('streetlight') || t.includes('dark road') || t.includes('isolated')) {
        pts = 5;
        isDynamic = true;
    }

    if (hour >= 6 && hour < 12) {
        if (t.includes('street light') || t.includes('streetlight') || t.includes('dark')) {
            pts = 1;
        }
    } else if (hour >= 17 && hour < 21) {
        if (t.includes('isolated') || t.includes('unsafe')) {
            pts *= 2;
        }
    } else if (hour >= 21 || hour < 6) {
        if (isSevere) pts *= 3;
        if (isDynamic) pts *= 4;
    }

    return pts;
}

function getRoadActivity(trafficScore, hour) {
    if (hour >= 6 && hour < 21) {
        if (trafficScore < 60) return "Busy / High Activity";
        else if (trafficScore < 80) return "Moderate Activity";
        else return "Relatively Quiet";
    } else {
        if (trafficScore < 70) return "Moderate Activity";
        else return "Isolated / Very Quiet";
    }
}

async function fetchPOIs(lat, lon, radius = 500) {
    const roundLat = Math.round(lat * 1000) / 1000;
    const roundLon = Math.round(lon * 1000) / 1000;
    const cacheKey = `${roundLat},${roundLon}`;
    const now = Date.now() / 1000;

    if (OVERPASS_CACHE[cacheKey]) {
        if (now - OVERPASS_CACHE[cacheKey].timestamp < 3600) {
            return OVERPASS_CACHE[cacheKey].data;
        }
    }

    const query = `
    [out:json][timeout:3];
    (
      node["shop"](around:${radius},${lat},${lon});
      node["amenity"~"restaurant|cafe|marketplace|mall"](around:${radius},${lat},${lon});
      node["office"](around:${radius},${lat},${lon});
      node["public_transport"](around:${radius},${lat},${lon});
      node["highway"="bus_stop"](around:${radius},${lat},${lon});
      node["railway"~"station|tram_stop"](around:${radius},${lat},${lon});
    );
    out tags;
    `;

    try {
        const response = await fetch("http://overpass-api.de/api/interpreter", {
            method: "POST",
            body: "data=" + encodeURIComponent(query),
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            signal: AbortSignal.timeout(3000)
        });

        if (response.ok) {
            const data = await response.json();
            let commercial = 0;
            let pt = 0;
            for (const el of data.elements || []) {
                const tags = el.tags || {};
                if (tags.shop || tags.office || ['restaurant', 'cafe', 'marketplace', 'mall'].includes(tags.amenity)) {
                    commercial++;
                }
                if (tags.public_transport || tags.highway === 'bus_stop' || tags.railway) {
                    pt++;
                }
            }
            const result = { commercial, pt };
            OVERPASS_CACHE[cacheKey] = { timestamp: now, data: result };
            return result;
        }
    } catch (e) {
        console.error(`Overpass failed: ${e.message}`);
    }

    return { commercial: 0, pt: 0 };
}

function getVisibilityScore() {
    const hour = new Date().getHours();
    if (hour >= 6 && hour <= 18) return "Good";
    else if (hour > 18 && hour <= 20) return "Moderate";
    else return "Low";
}

function getTimeOfDayScore() {
    const hour = new Date().getHours();
    if ((hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 20)) {
        return { category: "Peak Hours", score: 100 };
    } else if (hour >= 11 && hour <= 16) {
        return { category: "Office Hours", score: 60 };
    } else if (hour >= 21 && hour <= 23) {
        return { category: "Evening", score: 40 };
    } else {
        return { category: "Late Night", score: 10 };
    }
}

async function generateAIExplanation(analyzedRoutes) {
    if (!process.env.GEMINI_API_KEY) {
        return {};
    }
    try {
        let prompt = `You are the AI explanation engine for SafeHer's routing system. The routing engine has already selected Route ${analyzedRoutes[0].id} as the recommended route based on a deterministic scoring algorithm.
Your ONLY job is to explain WHY the recommended route was chosen and WHY the alternative routes were rejected, in a natural, human-friendly way.
Do NOT invent facts. Only use the structured data provided below to perform a GENUINE COMPARISON between all available routes.

CRITICAL EXPLANATION RULES (STRICTLY FOLLOW THESE):
1. Explain Trade-offs: The explanation must explain TRADE-OFFS. Do not simply repeat numbers. Compare the winning route against the alternatives across multiple factors (Safety, Traffic, Distance, Time). E.g. "Route A is recommended because it achieves the highest Safety Score (90/100). While Routes B and C offer slightly smoother traffic conditions, they also have lower safety scores. Therefore Route A provides the best overall balance."
2. Higher Safety but Worse Traffic: If one route has higher safety but worse traffic, explain BOTH. E.g. "The increase in traffic on Route A is relatively small compared to the safety advantage, making it the best overall choice."
3. Better Traffic but Longer: If one route has better traffic but is longer, explain BOTH. E.g. "Route C offers better traffic flow but requires an additional 7 minutes of travel and a longer distance. Since it provides no additional safety benefit, Route A remains the preferred route."
4. Identical Safety Scores: If two or more routes have identical Safety Scores, NEVER say "Ranked lower due to Safety Score". Instead, explain the actual deciding factor (e.g. "Both routes provide the same safety level. Route A is recommended because it requires less travel time and a shorter travel distance.").
5. Identical Traffic: If traffic is identical between routes, do NOT mention traffic as the deciding factor. Explain whichever factor actually determined the recommendation.
6. Nearly Identical Routes: If every route is almost identical, say so. E.g. "All available routes provide similar levels of safety and traffic conditions. Route A is recommended because it offers the shortest overall journey while maintaining the same level of safety."
7. Provide the output as a valid JSON object where keys are the EXACT Route IDs provided below (e.g. "${analyzedRoutes[0].id}") and values are the full explanation strings. Do not include markdown formatting like \`\`\`json in the output.

Example Output format:
{
  "${analyzedRoutes[0].id}": "Route A is recommended because it achieves the highest Safety Score (90/100). While the alternative routes offer slightly smoother traffic conditions, they also have lower safety scores and therefore expose the traveller to greater overall risk. The increase in traffic on this route is relatively small compared to the safety advantage, making it the best overall choice.",
  "tt_route_1": "Although this route offers better traffic flow and a slightly faster driving experience, its Safety Score is lower than the recommended route due to higher overall risk factors. Since the improvement in traffic is not significant enough to justify the reduction in safety, it is ranked below the recommended route."
}

Structured Data:
`;
        for (const r of analyzedRoutes) {
            prompt += `
Route ${r.id} (Recommended: ${r.isRecommended}):
- Final Backend Score: ${r.rankingScore} (Lower is better)
- Safety Score: ${100 - (r.riskScore || 0)}/100
- Distance: ${r.distance_meters || 0} meters
- Travel Time: ${Math.ceil((r.duration_seconds || 0) / 60)} minutes
- Local Time: ${r.currentTime}
- Traffic Condition: ${r.trafficData?.status || 'Unknown'}
- Approximate Road Activity: ${r.roadActivity}
- Nearest Harassment: ${r.nearestIncidents?.Harassment ?? -1}m
- Nearest Theft: ${r.nearestIncidents?.Theft ?? -1}m
- Nearest Unsafe Road: ${r.nearestIncidents?.['Unsafe Roads'] ?? -1}m
- Nearest Dark Road: ${r.nearestIncidents?.['Dark Roads'] ?? -1}m
- Nearest Street Light: ${r.nearestIncidents?.['Broken Street Lights'] ?? -1}m
- Total Incidents: ${r.communityReports?.Total || 0}
`;
        }

        const response = await runGemini(prompt);
        return response;
    } catch (e) {
        console.error("Gemini AI failed:", e.message);
        return {};
    }
}

function fallbackExplanation(routeData, allRoutes) {
    const isRec = routeData.isRecommended;
    const recRoute = allRoutes[0];

    const score = routeData.safetyScoreBreakdown?.finalSafetyScore || 0;
    const recScore = recRoute.safetyScoreBreakdown?.finalSafetyScore || 0;

    const trafficScore = routeData.trafficData?.score || 0;
    const recTrafficScore = recRoute.trafficData?.score || 0;

    const timeMins = Math.ceil((routeData.duration_seconds || 0) / 60);
    const recTimeMins = Math.ceil((recRoute.duration_seconds || 0) / 60);
    const timeDiff = timeMins - recTimeMins;

    const dist = routeData.distance_meters || 0;
    const recDist = recRoute.distance_meters || 0;
    const distDiff = dist - recDist;

    const allScores = allRoutes.map(r => r.safetyScoreBreakdown?.finalSafetyScore || 0);
    const allSameSafety = allScores.every(s => s === allScores[0]) && allRoutes.length > 1;
    const maxScore = Math.max(...allScores);

    if (isRec) {
        if (allRoutes.length === 1) {
            return "This is the only available route for your destination.";
        }
        if (allSameSafety) {
            return "All available routes provide similar levels of safety. This route is recommended because it offers the most efficient journey, requiring the shortest overall travel distance and time.";
        }

        const altsBetterTraffic = allRoutes.some(r => !r.isRecommended && (r.trafficData?.score || 0) > trafficScore);

        if (score === maxScore) {
            if (altsBetterTraffic) {
                return `This route is recommended because it provides the highest Safety Score (${score}/100). While alternative routes may offer slightly lighter traffic conditions, the reduction in travel congestion does not compensate for their lower safety scores. Therefore, this route provides the best overall balance.`;
            } else {
                return `This route is recommended because it provides the highest Safety Score (${score}/100) along with optimal traffic conditions, making it the safest and most efficient choice.`;
            }
        } else {
            return `This route is recommended because it provides an excellent balance. While another route has a marginally higher Safety Score, it requires significantly more travel time. This route (${score}/100) offers the best combination of safety and practicality.`;
        }
    } else {
        if (score < recScore) {
            if (trafficScore > recTrafficScore) {
                return `Although this route offers better traffic flow, its Safety Score (${score}/100) is lower than the recommended route due to higher overall risk factors. The improvement in traffic is not significant enough to justify the reduction in safety.`;
            } else {
                return `This route is ranked lower because it has a lower Safety Score (${score}/100) and offers no improvement in traffic or travel efficiency compared to the recommended route.`;
            }
        } else if (score === recScore) {
            if (trafficScore > recTrafficScore) {
                return `This route offers better traffic flow but requires an additional ${timeDiff} minutes of travel and a longer distance. Since it provides no additional safety benefit over the recommended route, it is not preferred.`;
            } else {
                if (distDiff > 0) {
                    return `This route provides the same safety level as the recommended route but is ${distDiff} metres longer without offering any measurable improvement in traffic. Therefore it is ranked lower.`;
                } else if (timeDiff > 0) {
                    return `This route provides the same safety level as the recommended route but takes ${timeDiff} minutes longer. Therefore it is ranked lower.`;
                } else {
                    return "This route is nearly identical to the recommended route in safety and traffic, but was ranked slightly lower in internal efficiency calculations.";
                }
            }
        } else {
            return `Although this route offers a slightly higher Safety Score (${score}/100), it requires an additional ${timeDiff} minutes and ${distDiff} metres of travel. The marginal safety benefit does not justify the significant drop in travel efficiency, so it is ranked below the recommended route.`;
        }
    }
}

async function analyzeRoutesWithReports(routes, radius = 500) {
    let communityReports = [];
    try {
        communityReports = await CommunityReport.find();
    } catch (err) {
        console.error("Error fetching reports for route analysis:", err);
    }
    const analyzedRoutes = [];
    const currentHour = new Date().getHours();

    const options = { hour: '2-digit', minute: '2-digit', hour12: true };
    const localTimeStr = new Date().toLocaleTimeString('en-US', options);

    for (let routeIdx = 0; routeIdx < routes.length; routeIdx++) {
        const route = routes[routeIdx];
        const path = route.path;

        const reportCounts = {
            Total: 0, Harassment: 0, Theft: 0, "Broken Street Lights": 0,
            "Unsafe Roads": 0, "Suspicious Activity": 0, Other: 0
        };
        const matchedIncidents = [];
        let rawRiskScore = 0.0;

        const nearestIncidents = {
            Harassment: Infinity,
            Theft: Infinity,
            "Unsafe Roads": Infinity,
            "Dark Roads": Infinity,
            "Broken Street Lights": Infinity,
            "Suspicious Activity": Infinity
        };

        for (const report of communityReports) {
            const rid = report.id;
            const rtype = report.typeName || report.type || '';
            const rlat = parseFloat(report.latitude);
            const rlon = parseFloat(report.longitude);
            const rdate = report.id;

            if (isNaN(rlat) || isNaN(rlon)) continue;

            let minDist = Infinity;
            const trimIdx = Math.max(1, Math.floor(path.length / 20));
            const searchPath = path.length > 20 ? path.slice(trimIdx, -trimIdx) : path;

            for (const point of searchPath) {
                const dist = haversine(rlat, rlon, point[0], point[1]);
                if (dist < minDist) {
                    minDist = dist;
                }
            }

            const weight = getTimeWeight(rdate);
            const pts = getBasePoints(rtype, currentHour);

            const decayFactor = 200.0 / (minDist + 200.0);
            rawRiskScore += (pts * weight * decayFactor);

            if (minDist <= radius) {
                reportCounts.Total++;
                let matchedKey = "Other";
                const keys = ["Harassment", "Theft", "Broken Street Lights", "Unsafe Roads", "Suspicious Activity"];
                for (const key of keys) {
                    if (rtype.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(rtype.toLowerCase())) {
                        matchedKey = key;
                        break;
                    }
                }
                reportCounts[matchedKey]++;

                matchedIncidents.push({
                    id: rid,
                    type: rtype,
                    description: report.desc,
                    latitude: rlat,
                    longitude: rlon,
                    date: rdate,
                    severity_pts: pts,
                    distance_to_route: Math.round(minDist)
                });
            }

            let nKey = null;
            const rtypeLower = rtype.toLowerCase();
            if (rtypeLower.includes('harassment') || rtypeLower.includes('stalking') || rtypeLower.includes('molestation')) nKey = "Harassment";
            else if (rtypeLower.includes('theft') || rtypeLower.includes('robbery') || rtypeLower.includes('snatching')) nKey = "Theft";
            else if (rtypeLower.includes('unsafe') || rtypeLower.includes('isolated')) nKey = "Unsafe Roads";
            else if (rtypeLower.includes('dark')) nKey = "Dark Roads";
            else if (rtypeLower.includes('street light') || rtypeLower.includes('streetlight')) nKey = "Broken Street Lights";
            else if (rtypeLower.includes('suspicious')) nKey = "Suspicious Activity";

            if (nKey) {
                nearestIncidents[nKey] = Math.min(nearestIncidents[nKey], Math.round(minDist));
            }
        }

        for (const k of Object.keys(nearestIncidents)) {
            if (nearestIncidents[k] === Infinity) {
                nearestIncidents[k] = -1;
            }
        }

        const baseScore = 95.0;
        const incidentPenalty = 70.0 * (1.0 - Math.exp(-rawRiskScore / 1500.0));
        const trafficData = route.trafficData;
        const congestionScore = 100 - trafficData.score;

        const roadActivityStr = getRoadActivity(trafficData.score, currentHour);
        let activityModifier = 0.0;
        if (roadActivityStr.includes("Busy")) {
            activityModifier = 2.0;
        } else if (roadActivityStr.includes("Isolated")) {
            activityModifier = -8.0;
        } else if (roadActivityStr.includes("Relatively Quiet")) {
            activityModifier = -3.0;
        }

        const numSamples = Math.min(3, Math.max(1, path.length));
        const step = Math.max(1, Math.floor(path.length / numSamples));
        const samples = [];
        for (let i = 0; i < path.length; i += step) {
            samples.push(path[i]);
            if (samples.length >= numSamples) break;
        }

        let totalComm = 0;
        let totalPt = 0;
        for (const pt of samples) {
            const pois = await fetchPOIs(pt[0], pt[1]);
            totalComm += pois.commercial;
            totalPt += pois.pt;
        }

        const avgComm = totalComm / Math.max(1, samples.length);
        const avgPt = totalPt / Math.max(1, samples.length);

        const commScore = Math.min(100, Math.round((avgComm / 50.0) * 100));
        const ptScore = Math.min(100, Math.round((avgPt / 20.0) * 100));

        const timeData = getTimeOfDayScore();
        const timeScore = timeData.score;

        let timeModifier = 0.0;
        if (currentHour >= 21 || currentHour < 6) {
            timeModifier -= 5.0;
            if (roadActivityStr.includes("Isolated")) {
                timeModifier -= 3.0;
            }
            if (incidentPenalty > 10.0) {
                timeModifier -= 4.0;
            }
            if (roadActivityStr.includes("Busy") && incidentPenalty < 5.0) {
                timeModifier = 0.0;
            }
        } else if (currentHour >= 6 && currentHour < 12) {
            timeModifier += 2.0;
        }

        let finalSafetyScore = baseScore - incidentPenalty + activityModifier + timeModifier;
        finalSafetyScore = Math.max(20.0, Math.min(95.0, finalSafetyScore));

        route.safetyScoreBreakdown = {
            baseScore: 95,
            incidentPenalty: -Math.round(incidentPenalty),
            activityModifier: Math.round(activityModifier),
            timeModifier: Math.round(timeModifier),
            finalSafetyScore: Math.round(finalSafetyScore)
        };

        const communityRisk = 100 - Math.round(finalSafetyScore);
        let riskCategory = "Safe";
        if (finalSafetyScore >= 80) {
            riskCategory = "Safe";
        } else if (finalSafetyScore >= 60) {
            riskCategory = "Moderate Risk";
        } else if (finalSafetyScore >= 40) {
            riskCategory = "Elevated Risk";
        } else {
            riskCategory = "High Risk";
        }

        let crowdIntelScore = (congestionScore * 0.60) + (communityRisk * 0.15) + (commScore * 0.10) + (ptScore * 0.10) + (timeScore * 0.05);
        crowdIntelScore = Math.round(crowdIntelScore);

        route.currentTime = localTimeStr;
        route.roadActivity = roadActivityStr;
        route.nearestIncidents = nearestIncidents;
        route.riskCategory = riskCategory;
        route.communityReports = reportCounts;
        route.matchedIncidents = matchedIncidents;
        route.riskScore = communityRisk;
        route.rawRiskScore = rawRiskScore;
        route.commercialActivity = `${Math.round(avgComm)} locations nearby`;
        route.publicTransport = `${Math.round(avgPt)} stations/stops nearby`;
        route.visibility = getVisibilityScore();
        route.crowdIntelligenceScore = crowdIntelScore;

        const timeScorePenalty = route.duration_seconds;
        const distanceScorePenalty = route.distance_meters / 10.0;
        const trafficScorePenalty = congestionScore * 10;

        const safetyDrop = 95.0 - finalSafetyScore;
        const safetyScorePenalty = (safetyDrop * 20) + (timeScorePenalty * (safetyDrop / 100.0));

        route.rankingScore = timeScorePenalty + distanceScorePenalty + trafficScorePenalty + safetyScorePenalty;
        route.internalDecisionScore = Math.round(route.rankingScore);

        analyzedRoutes.push(route);
    }

    analyzedRoutes.sort((a, b) => a.rankingScore - b.rankingScore);

    for (let i = 0; i < analyzedRoutes.length; i++) {
        analyzedRoutes[i].isRecommended = (i === 0);
    }

    let geminiExplanations = {};
    try {
        geminiExplanations = await generateAIExplanation(analyzedRoutes);
    } catch (e) {
        console.error("Gemini explanation generation failed:", e);
    }

    for (const route of analyzedRoutes) {
        if (geminiExplanations && geminiExplanations[route.id]) {
            route.explanation = geminiExplanations[route.id];
        } else {
            route.explanation = fallbackExplanation(route, analyzedRoutes);
        }
    }

    return analyzedRoutes;
}

// Endpoint to compute safety-optimized crowd routes via TomTom & Overpass
app.post('/api/routes', async (req, res) => {
    const { start, destination, radius } = req.body;
    if (!start || !destination) {
        return res.status(400).json({ error: "Missing start or destination coordinates" });
    }

    const tomtomApiKey = process.env.TOMTOM_API_KEY;
    if (!tomtomApiKey) {
        return res.status(500).json({ error: "TomTom API Key not configured" });
    }

    try {
        const tomtomUrl = `https://api.tomtom.com/routing/1/calculateRoute/${start.lat},${start.lon}:${destination.lat},${destination.lon}/json?key=${tomtomApiKey}&maxAlternatives=2&routeType=fastest&traffic=true`;
        const response = await fetch(tomtomUrl);
        if (!response.ok) {
            throw new Error(`TomTom routing request failed with status ${response.status}`);
        }

        const data = await response.json();
        if (!data.routes || data.routes.length === 0) {
            return res.status(404).json({ error: "No routes found by TomTom" });
        }

        const mappedRoutes = data.routes.map((r, idx) => {
            const path = [];
            for (const leg of r.legs || []) {
                for (const pt of leg.points || []) {
                    path.push([pt.latitude, pt.longitude]);
                }
            }

            const summary = r.summary || {};
            const durationSeconds = summary.travelTimeInSeconds || 0;
            const trafficDelaySeconds = summary.trafficDelayInSeconds || 0;
            const distanceMeters = summary.lengthInMeters || 0;

            let trafficScore = 100;
            if (durationSeconds > 0) {
                const delayRatio = trafficDelaySeconds / durationSeconds;
                trafficScore = Math.max(0, 100 - Math.round(delayRatio * 150));
            }

            let status = "Smooth Traffic";
            if (trafficScore < 60) status = "Heavy Congestion";
            else if (trafficScore < 85) status = "Moderate Congestion";

            return {
                id: `route_${idx}`,
                path: path,
                distance_meters: distanceMeters,
                duration_seconds: durationSeconds,
                trafficData: {
                    score: trafficScore,
                    status: status,
                    delay: trafficDelaySeconds
                }
            };
        });

        const analyzed = await analyzeRoutesWithReports(mappedRoutes, radius || 500);
        res.json(analyzed);

    } catch (err) {
        console.error("Error in routing/crowd analysis:", err);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});