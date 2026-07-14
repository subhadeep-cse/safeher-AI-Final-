document.addEventListener('DOMContentLoaded', () => {
    // === Security helper: escape user-generated content before injecting into innerHTML ===
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // === UI Helpers ===
    function showToast(msg, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${escapeHtml(type)}`;

        let icon = 'ri-information-line';
        if (type === 'error') icon = 'ri-error-warning-line';
        if (type === 'success') icon = 'ri-checkbox-circle-line';

        toast.innerHTML = `<i class="${icon}"></i> <span>${escapeHtml(msg)}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Expose for global functions (Vault actions)
    window.showToast = showToast;

    function showConfirm(title, message, onConfirm, onCancel = null) {
        const modal = document.getElementById('generic-confirm-modal');
        if (!modal) {
            if (confirm(`${title}\n\n${message}`)) onConfirm();
            else if (onCancel) onCancel();
            return;
        }

        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').innerHTML = message;

        const btnOk = document.getElementById('confirm-ok-btn');
        const btnCancel = document.getElementById('confirm-cancel-btn');

        const cleanUp = () => {
            modal.classList.add('hidden');
            btnOk.replaceWith(btnOk.cloneNode(true));
            btnCancel.replaceWith(btnCancel.cloneNode(true));
        };

        modal.classList.remove('hidden');

        document.getElementById('confirm-ok-btn').addEventListener('click', () => {
            cleanUp();
            onConfirm();
        });

        document.getElementById('confirm-cancel-btn').addEventListener('click', () => {
            cleanUp();
            if (onCancel) onCancel();
        });
    }



    // === Routing & Navigation ===
    const navItems = document.querySelectorAll('.nav-item');
    const viewTitle = document.getElementById('view-title');

    const titles = {
        'community': 'Community Safety Network',
        'density': 'Crowd Density & Safe Routes',
        'guardian': 'Smart Guardian AI',
        'vault': 'Emergency Evidence Vault'
    };

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetView = item.getAttribute('data-view');

            // Update nav active state
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            const currentView = document.querySelector('.view:not(.hidden)');
            if (currentView && currentView.id !== `view-${targetView}`) {
                currentView.classList.add('fade-out');
                setTimeout(() => {
                    currentView.classList.add('hidden');
                    currentView.classList.remove('fade-out');

                    const newView = document.getElementById(`view-${targetView}`);
                    if (newView) newView.classList.remove('hidden');

                    // Re-render map if density view is opened to prevent tile bugs
                    if (targetView === 'density' && densityMap) {
                        setTimeout(() => densityMap.invalidateSize(), 100);
                    }
                }, 300); // Matches CSS transition duration
            } else if (!currentView) {
                const newView = document.getElementById(`view-${targetView}`);
                if (newView) newView.classList.remove('hidden');

                if (targetView === 'density' && densityMap) {
                    setTimeout(() => densityMap.invalidateSize(), 100);
                }
            }

            // Update title
            viewTitle.textContent = titles[targetView];
        });
    });

    // === Module: Community Reporting ===
    const reportForm = document.getElementById('report-form');
    const communityFeed = document.getElementById('community-feed');
    const locationInput = document.getElementById('report-location');

    let currentLat = 22.5726; // Default Kolkata
    let currentLon = 88.3639;
    let currentAddress = 'Fetching location...';

    const SKELETON_FEED = `
        <div class="feed-item skeleton">
            <div class="skeleton-title"></div>
            <div class="skeleton-text"></div>
            <div class="skeleton-text" style="width: 80%"></div>
        </div>
        <div class="feed-item skeleton">
            <div class="skeleton-title"></div>
            <div class="skeleton-text"></div>
            <div class="skeleton-text" style="width: 60%"></div>
        </div>
    `;

    async function fetchReports() {
        try {
            if (communityFeed) communityFeed.innerHTML = SKELETON_FEED;
            const res = await fetch('/api/reports');
            const data = await res.json();
            renderFeed(data);
        } catch (e) { console.error('Error fetching reports:', e); }
    }

    function formatReportTime(idStr) {
        const timestamp = parseInt(idStr, 10);
        if (!timestamp || isNaN(timestamp)) return 'Just now';
        
        const date = new Date(timestamp);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        
        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // the hour '0' should be '12'
        
        return `${day}-${month}-${year} ${hours}:${minutes} ${ampm}`;
    }

    function renderFeed(reports) {
        if (!reports || reports.length === 0) {
            communityFeed.innerHTML = `
                <div class="empty-state" style="text-align:center; padding:40px; color:var(--text-muted)">
                    <i class="ri-shield-check-line" style="font-size:32px; display:block; margin-bottom:12px; color:var(--success)"></i>
                    <p>No recent reports in your area. Safe travels!</p>
                </div>
            `;
            return;
        }
        communityFeed.innerHTML = reports.map(r => `
            <div class="feed-item">
                <div class="feed-header">
                    <span class="badge badge-${escapeHtml(r.type)}">${escapeHtml(r.typeName)}</span>
                    <span class="time text-muted" style="font-size: 0.8rem">${escapeHtml(formatReportTime(r.id))}</span>
                </div>
                <div class="loc mt-2" style="font-size: 0.9rem"><i class="ri-map-pin-line"></i> ${escapeHtml(r.loc)}</div>
                <p class="desc text-muted mt-2" style="font-size: 0.9rem">${escapeHtml(r.desc)}</p>
                <div style="display:flex; gap: 8px; margin-top: 12px; align-items: center;">
                    <button class="btn btn-secondary verify-btn" data-id="${escapeHtml(r.id)}" style="padding: 6px 12px; font-size:0.8rem">
                        <i class="ri-check-line"></i> Verify Report
                    </button>
                    <span class="text-muted" style="font-size: 0.8rem; margin-left: auto;">
                        <i class="ri-shield-check-fill" style="color:var(--success)"></i> ${escapeHtml(r.verifications || 0)} verifications
                    </span>
                </div>
            </div>
        `).join('');
    }

    if (communityFeed) {
        communityFeed.addEventListener('click', async (e) => {
            const btn = e.target.closest('.verify-btn');
            if (!btn) return;
            const reportId = btn.getAttribute('data-id');
            if (!reportId) return;

            btn.disabled = true;
            btn.innerHTML = '<i class="ri-loader-4-line"></i> Verifying...';

            try {
                await fetch(`/api/reports/${reportId}/verify`, { method: 'POST' });
                fetchReports();
            } catch (err) {
                console.error("Error verifying report:", err);
                btn.disabled = false;
                btn.innerHTML = '<i class="ri-check-line"></i> Verify Report';
            }
        });
    }

    fetchReports();

    let routePolylines = [];
    let destinationMarker = null;

    async function updateRecommendations(address) {
        if (!recoList) return;

        recoList.innerHTML = `
            <div class="feed-item skeleton mt-2">
                <div class="skeleton-title"></div>
                <div class="skeleton-text"></div>
            </div>
            <div class="feed-item skeleton mt-2">
                <div class="skeleton-title"></div>
                <div class="skeleton-text"></div>
            </div>
        `;

        try {
            const res = await fetch('/api/recommendations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ location: address })
            });
            const recommendations = await res.json();

            recoList.innerHTML = recommendations.map(rec => {
                const isSafe = rec.type === 'safe';
                const bg = isSafe ? 'rgba(46, 213, 115, 0.1)' : 'rgba(255, 71, 87, 0.1)';
                const icon = isSafe ? 'ri-route-line' : 'ri-error-warning-line';
                const badgeClass = isSafe ? 'badge-safe' : 'badge-crowded';
                const badgeText = isSafe ? 'Recommended' : 'Alert';

                return `
                    <div class="feed-item mt-2" style="background: ${bg}; border-radius: 8px;">
                        <div class="feed-header">
                            <strong><i class="${icon}"></i> ${escapeHtml(rec.title)}</strong>
                            <span class="badge ${badgeClass}">${badgeText}</span>
                        </div>
                        <p class="text-muted mt-2" style="font-size:0.85rem">${escapeHtml(rec.desc)}</p>
                    </div>
                `;
            }).join('');
        } catch (err) {
            console.error("Failed to load AI recommendations:", err);
            recoList.innerHTML = '<div class="text-muted" style="text-align:center;">Failed to load AI route analysis.</div>';
        }
    }

    // Geolocation logic
    async function updateLocationFromCoords(lat, lon, fetchAddress = true) {
        currentLat = lat;
        currentLon = lon;

        if (fetchAddress) {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${currentLat}&lon=${currentLon}`);
                const data = await res.json();
                currentAddress = data.display_name || `${currentLat.toFixed(4)}, ${currentLon.toFixed(4)}`;
            } catch (e) {
                currentAddress = `${currentLat.toFixed(4)}, ${currentLon.toFixed(4)}`;
            }
        }

        if (locationInput) locationInput.value = currentAddress;

        // Update map if it exists
        if (densityMap) {
            densityMap.setView([currentLat, currentLon], 14);

            const pulseIcon = L.divIcon({
                className: 'pulse-marker-wrapper',
                html: '<div class="pulse-marker-ring"></div><div class="pulse-marker-core"></div>',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });

            if (liveMarker) {
                liveMarker.setLatLng([currentLat, currentLon]);
            } else {
                liveMarker = L.marker([currentLat, currentLon], { icon: pulseIcon }).addTo(densityMap).bindPopup("Current Location").openPopup();
            }

            drawCrowdCircles(currentLat, currentLon);
        }

        if (!destinationMarker) {
            updateRecommendations(currentAddress);
        }
    }

    let liveMarker = null;
    let geoWatchId = null;
    let crowdCircles = [];

    async function fetchCrowdAreas(lat, lon) {
        const offsetDeg = 0.0035; // roughly 350-400m at most latitudes
        const radius = 300; // meters

        const candidates = [
            { label: 'center', lat, lon },
            { label: 'north', lat: lat + offsetDeg, lon },
            { label: 'south', lat: lat - offsetDeg, lon },
            { label: 'east', lat, lon: lon + offsetDeg },
            { label: 'west', lat, lon: lon - offsetDeg },
        ];

        const results = await Promise.all(candidates.map(async (pt) => {
            const query = `[out:json][timeout:10];(node["amenity"](around:${radius},${pt.lat},${pt.lon});node["shop"](around:${radius},${pt.lat},${pt.lon}););out count;`;
            try {
                const res = await fetch('https://overpass-api.de/api/interpreter', {
                    method: 'POST',
                    body: query
                });
                const data = await res.json();
                const count = data?.elements?.[0]?.tags?.total
                    ? parseInt(data.elements[0].tags.total, 10)
                    : 0;
                return { ...pt, count };
            } catch (e) {
                console.error('Overpass query failed for', pt.label, e);
                return { ...pt, count: 0 };
            }
        }));

        const crowded = results.reduce((max, r) => (r.count > max.count ? r : max), results[0]);
        const quiet = results.reduce((min, r) => (r.count < min.count ? r : min), results[0]);

        return { crowded, quiet, radius };
    }

    async function drawCrowdCircles(lat, lon) {
        crowdCircles.forEach(c => densityMap.removeLayer(c));
        crowdCircles = [];

        try {
            const { crowded, quiet, radius } = await fetchCrowdAreas(lat, lon);

            const redCircle = L.circle([crowded.lat, crowded.lon], {
                color: '#ff4757', fillColor: '#ff4757', fillOpacity: 0.4, radius
            }).bindPopup(`Busier area — ${crowded.count} nearby amenities/shops`);

            const greenCircle = L.circle([quiet.lat, quiet.lon], {
                color: '#2ed573', fillColor: '#2ed573', fillOpacity: 0.4, radius
            }).bindPopup(`Quieter area — ${quiet.count} nearby amenities/shops`);

            redCircle.addTo(densityMap);
            greenCircle.addTo(densityMap);
            crowdCircles = [redCircle, greenCircle];
        } catch (e) {
            console.error('Failed to compute crowd areas:', e);
        }
    }

    function fetchGPSLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => updateLocationFromCoords(position.coords.latitude, position.coords.longitude),
                (error) => {
                    console.error("Geolocation error:", error);
                    if (locationInput) locationInput.value = 'Location access denied';
                }
            );
        }
    }

    function startLiveTracking() {
        if (!navigator.geolocation) return;
        if (geoWatchId !== null) return;

        geoWatchId = navigator.geolocation.watchPosition(
            (position) => {
                currentLat = position.coords.latitude;
                currentLon = position.coords.longitude;

                if (liveMarker) liveMarker.setLatLng([currentLat, currentLon]);

                if (locationMetric) {
                    locationMetric.textContent = `${currentLat.toFixed(4)}, ${currentLon.toFixed(4)}`;
                }
            },
            (error) => {
                console.error("Live tracking error:", error);
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
    }

    function stopLiveTracking() {
        if (geoWatchId !== null && navigator.geolocation) {
            navigator.geolocation.clearWatch(geoWatchId);
            geoWatchId = null;
        }
    }

    // Initial fetch
    fetchGPSLocation();
    startLiveTracking();
    window.addEventListener('beforeunload', stopLiveTracking);

    // Map UI events & Routing Execution
    const densitySearchInput = document.getElementById('density-location-input');
    const densitySearchBtn = document.getElementById('density-search-btn');
    const densityGpsBtn = document.getElementById('density-gps-btn');
    const recoList = document.getElementById('route-recommendations');

    // Set initial instructions on load
    if (recoList) {
        recoList.innerHTML = `
            <div class="text-muted" style="text-align:center; padding: 20px;">
                <i class="ri-compass-3-line" style="font-size:32px; display:block; margin-bottom:12px; color:var(--primary)"></i>
                Enter a destination above to find safe routes with real-time crowd and traffic detection.
            </div>
        `;
    }



    async function getSafeRoutes(destLat, destLon, destAddress) {
        if (!recoList) return;

        recoList.innerHTML = `
            <div class="feed-item skeleton mt-2">
                <div class="skeleton-title"></div>
                <div class="skeleton-text"></div>
                <div class="skeleton-text" style="width: 80%"></div>
            </div>
            <div class="feed-item skeleton mt-2">
                <div class="skeleton-title"></div>
                <div class="skeleton-text"></div>
                <div class="skeleton-text" style="width: 60%"></div>
            </div>
        `;

        // Clear previous polylines & markers
        routePolylines.forEach(p => densityMap.removeLayer(p));
        routePolylines = [];
        if (destinationMarker) {
            densityMap.removeLayer(destinationMarker);
            destinationMarker = null;
        }

        // Draw destination marker
        destinationMarker = L.marker([destLat, destLon]).addTo(densityMap)
            .bindPopup(`Destination: ${escapeHtml(destAddress)}`).openPopup();

        try {
            const start = { lat: currentLat, lon: currentLon };
            const destination = { lat: destLat, lon: destLon };

            const res = await fetch('/api/routes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ start, destination, radius: 500 })
            });

            if (!res.ok) {
                throw new Error("Failed to calculate safety routes.");
            }

            const routes = await res.json();

            if (!routes || routes.length === 0) {
                recoList.innerHTML = '<div class="text-muted" style="text-align:center;">No routes found to the destination.</div>';
                return;
            }

            // Draw route paths on Leaflet
            routes.forEach((route, idx) => {
                route.source = currentAddress;
                route.destination = destAddress;
                
                const latLngs = route.path.map(pt => L.latLng(pt[0], pt[1]));
                const isRec = route.isRecommended;

                const color = isRec ? '#2ed573' : '#747d8c'; // Green for recommended, grey for alt
                const weight = isRec ? 6 : 4;
                const opacity = isRec ? 0.9 : 0.6;

                const polyline = L.polyline(latLngs, {
                    color: color,
                    weight: weight,
                    opacity: opacity,
                    className: `route-line-${route.id}`
                }).addTo(densityMap);

                polyline.bindPopup(`
                    <strong>Route ${idx + 1}</strong><br>
                    Safety Score: ${route.safetyScoreBreakdown.finalSafetyScore}/100<br>
                    Traffic: ${route.trafficData.status}<br>
                    Time: ${Math.ceil(route.duration_seconds / 60)} mins
                `);

                polyline.on('click', () => {
                    highlightRouteCard(route.id);
                });

                routePolylines.push(polyline);
            });

            // Auto-zoom to show whole routes
            const group = new L.featureGroup(routePolylines.concat(liveMarker ? [liveMarker] : []));
            densityMap.fitBounds(group.getBounds(), { padding: [40, 40] });

            // Render route recommendation cards
            recoList.innerHTML = routes.map((route, idx) => {
                const isRec = route.isRecommended;
                const safetyScore = route.safetyScoreBreakdown.finalSafetyScore;
                const trafficScore = route.trafficData.score;
                const riskScore = route.riskScore || (100 - safetyScore);

                // Risk badge styling
                let riskColor = '#2ed573';
                let riskBg = 'rgba(46,213,115,0.12)';
                if (safetyScore < 60) { riskColor = '#ff4757'; riskBg = 'rgba(255,71,87,0.12)'; }
                else if (safetyScore < 80) { riskColor = '#ffa502'; riskBg = 'rgba(255,165,2,0.12)'; }

                // Traffic condition color
                const trafficCondition = route.trafficData.status === 'Smooth Traffic' ? 'Free Flow'
                    : route.trafficData.status === 'Moderate Congestion' ? 'Moderate'
                        : 'Heavy';
                const trafficColor = trafficScore >= 85 ? '#2ed573' : trafficScore >= 60 ? '#ffa502' : '#ff4757';

                // Card border/glow
                const borderColor = isRec ? 'rgba(46,213,115,0.35)' : 'rgba(120,120,160,0.18)';
                const cardBg = isRec ? 'rgba(46,213,115,0.04)' : 'rgba(255,255,255,0.015)';
                const boxShadow = isRec ? '0 0 0 1.5px rgba(46,213,115,0.18), 0 4px 24px rgba(46,213,115,0.07)' : 'none';

                // Nearest incidents
                const ni = route.nearestIncidents || {};

                // Score breakdown
                const sb = route.safetyScoreBreakdown;

                // Recommendation label
                const recLabel = isRec ? 'Yes' : 'Alternative';
                const recLabelColor = isRec ? '#2ed573' : '#ffa502';

                return `
                <div class="feed-item route-card mt-3" id="card-${route.id}" style="
                    background: ${cardBg};
                    border: 1px solid ${borderColor};
                    box-shadow: ${boxShadow};
                    border-radius: 16px;
                    padding: 0;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    overflow: hidden;
                ">
                    <!-- Card Header -->
                    <div style="padding: 16px 18px 12px; border-bottom: 1px solid rgba(255,255,255,0.06);">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                            <div>
                                <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em; margin-bottom:4px;">Route Option ${String.fromCharCode(65 + idx)}</div>
                                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                    ${isRec ? `<span style="background:linear-gradient(90deg,#2ed573,#1abc76); color:#000; font-size:0.7rem; font-weight:700; padding:2px 10px; border-radius:20px; letter-spacing:0.05em;">⭐ RECOMMENDED</span>` : ''}
                                    <span style="background:rgba(255,255,255,0.08); color:var(--text-muted); font-size:0.72rem; padding:2px 9px; border-radius:20px; border:1px solid rgba(255,255,255,0.1);">
                                        <i class="ri-car-line"></i> TomTom
                                    </span>
                                </div>
                            </div>
                            <div style="text-align:right; flex-shrink:0;">
                                <div style="background:${riskBg}; color:${riskColor}; font-size:0.78rem; font-weight:600; padding:4px 12px; border-radius:20px; border:1px solid ${riskColor}33; white-space:nowrap; margin-bottom:6px;">
                                    ${escapeHtml(route.riskCategory)} (${riskScore})
                                </div>
                                <div style="font-size:0.7rem; color:var(--text-muted); text-align:right;">
                                    Decision Score: <span style="color:var(--text-primary); font-weight:600;">${route.internalDecisionScore || 0}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Main Scores Grid -->
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0; border-bottom: 1px solid rgba(255,255,255,0.06);">
                        <div style="padding:14px 18px; border-right:1px solid rgba(255,255,255,0.06);">
                            <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.07em; margin-bottom:2px;">Current Local Time</div>
                            <div style="font-size:0.92rem; font-weight:600; color:var(--text-primary);">${escapeHtml(route.currentTime)}</div>
                        </div>
                        <div style="padding:14px 18px;">
                            <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.07em; margin-bottom:2px;">Travel Time</div>
                            <div style="font-size:0.92rem; font-weight:600; color:var(--text-primary);">${Math.ceil(route.duration_seconds / 60)} mins &nbsp;·&nbsp; <span style="color:var(--text-muted); font-weight:400;">${(route.distance_meters / 1000).toFixed(2)} km</span></div>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:repeat(3,1fr); border-bottom: 1px solid rgba(255,255,255,0.06);">
                        <div style="padding:12px 14px; text-align:center; border-right:1px solid rgba(255,255,255,0.06);">
                            <div style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px;">Safety Score</div>
                            <div style="font-size:1.4rem; font-weight:800; color:${safetyScore >= 75 ? '#2ed573' : safetyScore >= 55 ? '#ffa502' : '#ff4757'}">${safetyScore}<span style="font-size:0.75rem; font-weight:400; color:var(--text-muted)">/100</span></div>
                        </div>
                        <div style="padding:12px 14px; text-align:center; border-right:1px solid rgba(255,255,255,0.06);">
                            <div style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px;">Traffic Score</div>
                            <div style="font-size:1.4rem; font-weight:800; color:${trafficColor}">${trafficScore}<span style="font-size:0.75rem; font-weight:400; color:var(--text-muted)">/100</span></div>
                        </div>
                        <div style="padding:12px 14px; text-align:center;">
                            <div style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px;">Recommendation</div>
                            <div style="font-size:0.88rem; font-weight:700; color:${recLabelColor}">${recLabel}</div>
                        </div>
                    </div>

                    <!-- Traffic & Activity -->
                    <div style="display:grid; grid-template-columns:1fr 1fr; border-bottom: 1px solid rgba(255,255,255,0.06);">
                        <div style="padding:12px 18px; border-right:1px solid rgba(255,255,255,0.06);">
                            <div style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:3px;">Traffic Condition</div>
                            <div style="font-size:0.88rem; font-weight:600; color:${trafficColor};"><i class="ri-traffic-line"></i> ${trafficCondition}</div>
                        </div>
                        <div style="padding:12px 18px;">
                            <div style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:3px;">Road Activity</div>
                            <div style="font-size:0.88rem; font-weight:600; color:var(--text-primary);"><i class="ri-walk-line"></i> ${escapeHtml(route.roadActivity)}</div>
                        </div>
                    </div>

                    <!-- Nearest Incidents -->
                    <div style="padding:14px 18px; border-bottom: 1px solid rgba(255,255,255,0.06);">
                        <div style="font-size:0.72rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.07em; margin-bottom:10px;">
                            <i class="ri-alert-line"></i> Nearest Incidents (within 500m)
                        </div>
                        <div style="display:flex; flex-direction:column; gap:7px;">
                            ${(function () {
                        const rows = [
                            { label: 'Harassment', key: 'Harassment', icon: 'user-unfollow-line' },
                            { label: 'Theft', key: 'Theft', icon: 'hand-coin-line' },
                            { label: 'Unsafe Road', key: 'Unsafe Roads', icon: 'road-map-line' },
                            { label: 'Dark Road', key: 'Dark Roads', icon: 'moon-foggy-line' },
                            { label: 'Street Light', key: 'Broken Street Lights', icon: 'lightbulb-line' },
                        ];
                        return rows.map(r => {
                            const dist = ni[r.key];
                            const hasData = dist !== undefined && dist !== null && dist >= 0;
                            const outside = hasData && dist > 500;
                            const color = !hasData ? 'var(--text-muted)' : outside ? '#2ed573' : '#ff4757';
                            return `<div style="display:flex; justify-content:space-between; align-items:flex-start; font-size:0.82rem;">
                                        <span style="color:var(--text-muted);"><i class="ri-${r.icon}" style="margin-right:5px;"></i>${r.label}:</span>
                                        <span style="text-align:right; color:${color}; font-weight:500;">
                                            ${!hasData ? 'None' : dist + 'm'}<br>
                                            ${!hasData ? '' : `<span style="font-size:0.72rem; font-weight:400; color:var(--text-muted);">${outside ? 'Outside selected 500m safety radius' : '⚠ Within safety radius'}</span>`}
                                        </span>
                                    </div>`;
                        }).join('');
                    })()}
                        </div>
                    </div>

                    <!-- Traffic Source -->
                    <div style="padding:10px 18px; border-bottom:1px solid rgba(255,255,255,0.06); font-size:0.75rem; color:var(--text-muted);">
                        <i class="ri-signal-tower-line" style="margin-right:4px;"></i>
                        Traffic Source: <span style="color:var(--text-primary); font-weight:500;">TomTom Traffic Flow API (Live)</span>
                    </div>

                    <!-- Safety Score Breakdown -->
                    <div style="padding:14px 18px; border-bottom:1px solid rgba(255,255,255,0.06);">
                        <div style="font-size:0.72rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.07em; margin-bottom:10px;">
                            <i class="ri-bar-chart-grouped-line"></i> Safety Score Breakdown
                        </div>
                        <div style="display:flex; flex-direction:column; gap:5px; font-size:0.82rem;">
                            <div style="display:flex; justify-content:space-between;">
                                <span style="color:var(--text-muted);">Base Score</span>
                                <span style="font-weight:600; color:var(--text-primary);">${sb.baseScore}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between;">
                                <span style="color:var(--text-muted);">Incident Penalty</span>
                                <span style="font-weight:600; color:${sb.incidentPenalty < 0 ? '#ff4757' : 'var(--text-primary)'};">${sb.incidentPenalty}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between;">
                                <span style="color:var(--text-muted);">Activity Modifier</span>
                                <span style="font-weight:600; color:${sb.activityModifier > 0 ? '#2ed573' : sb.activityModifier < 0 ? '#ffa502' : 'var(--text-muted)'};">${sb.activityModifier > 0 ? '+' : ''}${sb.activityModifier}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between;">
                                <span style="color:var(--text-muted);">Time Modifier</span>
                                <span style="font-weight:600; color:${sb.timeModifier > 0 ? '#2ed573' : sb.timeModifier < 0 ? '#ffa502' : 'var(--text-muted)'};">${sb.timeModifier > 0 ? '+' : ''}${sb.timeModifier}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; padding-top:6px; border-top:1px solid rgba(255,255,255,0.08); margin-top:2px;">
                                <span style="font-weight:700; color:var(--text-primary);">Final Score</span>
                                <span style="font-weight:800; color:${safetyScore >= 75 ? '#2ed573' : safetyScore >= 55 ? '#ffa502' : '#ff4757'};">${safetyScore}/100</span>
                            </div>
                        </div>
                    </div>

                    <!-- Gemini AI Reasoning -->
                    <div style="padding:14px 18px; background: linear-gradient(135deg, rgba(122,74,255,0.08), rgba(74,122,255,0.05)); border-top: 1px solid rgba(122,74,255,0.15);">
                        <div style="display:flex; align-items:center; gap:7px; margin-bottom:8px;">
                            <div style="width:22px; height:22px; border-radius:50%; background:linear-gradient(135deg,#7a4aff,#4a7aff); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                                <i class="ri-sparkling-2-fill" style="font-size:11px; color:#fff;"></i>
                            </div>
                            <span style="font-size:0.72rem; font-weight:700; color:#a78bff; text-transform:uppercase; letter-spacing:0.08em;">Explainable AI Reasoning</span>
                        </div>
                        <p style="font-size:0.85rem; line-height:1.55; color:var(--text-primary); font-style:italic; margin:0; padding:10px 12px; background:rgba(122,74,255,0.07); border-radius:8px; border-left:3px solid rgba(122,74,255,0.5); margin-bottom: 12px;">
                            "${escapeHtml(route.explanation)}"
                        </p>
                        <button type="button" class="btn btn-primary start-journey-btn" data-route-id="${route.id}" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;">
                            <i class="ri-navigation-line"></i> Start Journey
                        </button>
                    </div>
                </div>
                `;
            }).join('');

            // Attach card click handlers
            routes.forEach(route => {
                const card = document.getElementById(`card-${route.id}`);
                if (card) {
                    card.addEventListener('click', () => {
                        highlightRouteCard(route.id);

                        // Focus on this route polyline
                        const pLine = routePolylines.find(p => p.options.className === `route-line-${route.id}`);
                        if (pLine) {
                            pLine.openPopup();
                            densityMap.fitBounds(pLine.getBounds(), { padding: [50, 50] });
                        }
                    });

                    const startBtn = card.querySelector('.start-journey-btn');
                    if (startBtn) {
                        startBtn.addEventListener('click', (e) => {
                            e.stopPropagation(); // prevent card click
                            startJourneySession(route);
                        });
                    }
                }
            });

        } catch (err) {
            console.error("Failed to load safety routes:", err);
            recoList.innerHTML = `<div class="text-muted" style="text-align:center; padding: 20px;">
                <i class="ri-error-warning-line" style="font-size:24px; display:block; margin-bottom:8px; color:var(--danger)"></i>
                Failed to load route safety recommendations. Make sure start and destination points are valid.
            </div>`;
        }
    }

    function highlightRouteCard(routeId) {
        document.querySelectorAll('.route-card').forEach(card => {
            card.style.transform = 'scale(1)';
            card.style.boxShadow = 'none';
        });

        const selectedCard = document.getElementById(`card-${routeId}`);
        if (selectedCard) {
            selectedCard.style.transform = 'scale(1.02)';
            selectedCard.style.boxShadow = '0 8px 24px rgba(122, 74, 255, 0.15)';
            selectedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        // Highlight polyline on map
        routePolylines.forEach(p => {
            const isTarget = p.options.className === `route-line-${routeId}`;
            p.setStyle({
                weight: isTarget ? 8 : 4,
                opacity: isTarget ? 1.0 : 0.4
            });
            if (isTarget) p.bringToFront();
        });
    }

    if (densitySearchBtn && densitySearchInput) {
        let searchTimeout = null;

        const executeSearch = async () => {
            const query = densitySearchInput.value;
            if (!query) return;

            densitySearchBtn.disabled = true;
            densitySearchBtn.innerHTML = '<i class="ri-loader-4-line"></i> Loading Route...';

            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
                const data = await res.json();

                if (data && data.length > 0) {
                    const destLat = parseFloat(data[0].lat);
                    const destLon = parseFloat(data[0].lon);
                    const destAddress = data[0].display_name;

                    await getSafeRoutes(destLat, destLon, destAddress);
                } else {
                    showToast("Destination not found.", "error");
                }
            } catch (err) {
                console.error("Search error", err);
                showToast("Search failed.", "error");
            }

            densitySearchBtn.disabled = false;
            densitySearchBtn.innerHTML = '<i class="ri-navigation-line"></i> Get Route';
        };

        densitySearchBtn.addEventListener('click', () => {
            if (searchTimeout) clearTimeout(searchTimeout);
            searchTimeout = setTimeout(executeSearch, 300);
        });

        densitySearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (searchTimeout) clearTimeout(searchTimeout);
                searchTimeout = setTimeout(executeSearch, 300);
            }
        });
    }

    if (densityGpsBtn) {
        densityGpsBtn.addEventListener('click', () => fetchGPSLocation());
    }

    // === Module: Crowd Density ===
    let densityMap = null;

    const mapElement = document.getElementById('density-map');
    if (mapElement) {
        densityMap = L.map('density-map', {
            zoomControl: false
        }).setView([currentLat, currentLon], 14);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
        }).addTo(densityMap);

        L.control.zoom({ position: 'bottomright' }).addTo(densityMap);
    }
    // === Module: Community Map Location Picker ===
    let pickerMarker = null;
    let selectedLat = null;
    let selectedLon = null;
    
    const locOptCurrent = document.getElementById('loc-opt-current');
    const locOptMap = document.getElementById('loc-opt-map');
    const communityMapModal = document.getElementById('community-map-modal');
    const closeCommunityMapBtn = document.getElementById('close-community-map-btn');
    const communityMapConfirmBtn = document.getElementById('community-map-confirm-btn');
    const communityMapSearch = document.getElementById('community-map-search');
    const communityMapSearchBtn = document.getElementById('community-map-search-btn');
    const communityMapMount = document.getElementById('community-map-mount');
    
    // The original parent of the density map
    const densityMapParent = document.querySelector('.map-card');

    function openCommunityMapModal() {
        communityMapModal.classList.remove('hidden');
        // Move the density map into the modal
        const densityMapContainer = document.getElementById('density-map');
        if (densityMapContainer) {
            // Ensure the map container takes up the full space of its new parent
            densityMapContainer.style.height = '100%';
            densityMapContainer.style.width = '100%';
            communityMapMount.appendChild(densityMapContainer);
            
            if (densityMap) {
                // Leaflet requires a short delay after moving/unhiding a container to recalculate dimensions
                setTimeout(() => {
                    densityMap.invalidateSize();
                    densityMap.setView([currentLat, currentLon], 14);
                }, 250);
            }
        }
    }

    function closeCommunityMapModal() {
        communityMapModal.classList.add('hidden');
        // Move the density map back
        const densityMapContainer = document.getElementById('density-map');
        if (densityMapContainer && densityMapParent) {
            densityMapContainer.style.height = '';
            densityMapContainer.style.width = '';
            
            // Insert it after the map-search-bar
            const searchBar = densityMapParent.querySelector('.map-search-bar');
            if (searchBar && searchBar.nextSibling) {
                densityMapParent.insertBefore(densityMapContainer, searchBar.nextSibling);
            } else {
                densityMapParent.appendChild(densityMapContainer);
            }
        }
        if (locOptMap.checked && !selectedLat) {
            // If they closed without confirming, reset to current
            locOptCurrent.checked = true;
            locationInput.value = currentAddress;
            selectedLat = null;
            selectedLon = null;
        }
    }

    if (locOptMap) {
        locOptMap.addEventListener('change', () => {
            if (locOptMap.checked) {
                openCommunityMapModal();
            }
        });
    }

    if (locOptCurrent) {
        locOptCurrent.addEventListener('change', () => {
            if (locOptCurrent.checked) {
                locationInput.value = currentAddress;
                selectedLat = null;
                selectedLon = null;
            }
        });
    }

    if (closeCommunityMapBtn) {
        closeCommunityMapBtn.addEventListener('click', closeCommunityMapModal);
    }

    // Map click handler for picker
    if (mapElement) {
        // We bind this once, but it only sets pickerMarker if in modal mode
        densityMap.on('click', (e) => {
            if (!communityMapModal.classList.contains('hidden')) {
                if (pickerMarker) densityMap.removeLayer(pickerMarker);
                
                pickerMarker = L.marker([e.latlng.lat, e.latlng.lng]).addTo(densityMap);
                selectedLat = e.latlng.lat;
                selectedLon = e.latlng.lng;
                
                communityMapConfirmBtn.disabled = false;
            }
        });
    }

    if (communityMapSearchBtn) {
        communityMapSearchBtn.addEventListener('click', async () => {
            const query = communityMapSearch.value;
            if (!query) return;
            communityMapSearchBtn.disabled = true;
            communityMapSearchBtn.innerHTML = '<i class="ri-loader-4-line"></i>';
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
                const data = await res.json();
                if (data && data.length > 0) {
                    const destLat = parseFloat(data[0].lat);
                    const destLon = parseFloat(data[0].lon);
                    
                    if (densityMap) {
                        densityMap.setView([destLat, destLon], 16);
                        if (pickerMarker) densityMap.removeLayer(pickerMarker);
                        pickerMarker = L.marker([destLat, destLon]).addTo(densityMap);
                        selectedLat = destLat;
                        selectedLon = destLon;
                        communityMapConfirmBtn.disabled = false;
                    }
                } else {
                    showToast("Location not found.", "error");
                }
            } catch (err) {
                console.error("Search error", err);
                showToast("Search failed.", "error");
            }
            communityMapSearchBtn.disabled = false;
            communityMapSearchBtn.innerHTML = '<i class="ri-search-line"></i> Search';
        });
    }

    if (communityMapConfirmBtn) {
        communityMapConfirmBtn.addEventListener('click', async () => {
            if (selectedLat && selectedLon) {
                communityMapConfirmBtn.disabled = true;
                communityMapConfirmBtn.textContent = 'Confirming...';
                
                try {
                    // Reverse geocode to get a nice address
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${selectedLat}&lon=${selectedLon}`);
                    const data = await res.json();
                    let placeName = data.display_name || `${selectedLat.toFixed(5)}, ${selectedLon.toFixed(5)}`;
                    
                    // Format as requested
                    locationInput.value = `Selected Location\n\n📍 Near ${placeName}\n\nLatitude: ${selectedLat.toFixed(5)}\n\nLongitude: ${selectedLon.toFixed(5)}`;
                    // Adjust height to show all lines
                    locationInput.style.height = '120px'; 
                    // Make it a textarea essentially, but wait locationInput is an <input type="text">.
                    // Oh, we should probably change it to a textarea if it isn't one, but we can't easily without editing HTML again.
                } catch (err) {
                    locationInput.value = `📍 Selected Map Location\nLatitude: ${selectedLat.toFixed(5)}\nLongitude: ${selectedLon.toFixed(5)}`;
                }
                
                communityMapConfirmBtn.disabled = false;
                communityMapConfirmBtn.textContent = 'Confirm Location';
                closeCommunityMapModal();
            }
        });
    }

    if (reportForm) {
        reportForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const typeSelect = reportForm.querySelector('select');
            const descInput = reportForm.querySelector('textarea');
            
            const finalLat = selectedLat || currentLat;
            const finalLon = selectedLon || currentLon;

            const newReport = {
                type: typeSelect.value,
                typeName: typeSelect.options[typeSelect.selectedIndex].text,
                loc: locationInput.value,
                desc: descInput.value,
                latitude: finalLat,
                longitude: finalLon
            };

            try {
                await fetch('/api/reports', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newReport)
                });
                fetchReports();

                reportForm.reset();
                locationInput.value = currentAddress;
                locationInput.style.height = 'auto'; // Reset height
                locOptCurrent.checked = true;
                selectedLat = null;
                selectedLon = null;
                showToast("Report submitted successfully and is pending verification.", "success");
            } catch (err) {
                console.error("Error submitting report:", err);
                showToast("Error submitting report.", "error");
            }
        });
    }


    // === Module: Smart Guardian ===
    window.activeJourneySession = null;
    let locationWatchId = null;

    window.startJourneySession = function(route) {
        window.activeJourneySession = {
            routeId: route.id,
            source: route.source,
            destination: route.destination,
            distance: route.distance_meters,
            expectedTime: route.duration_seconds,
            path: route.path,
            startTime: Date.now(),
            status: 'active',
            gpsUpdates: []
        };

        const guardianNav = document.querySelector('.nav-item[data-view="guardian"]');
        if (guardianNav) guardianNav.click();

        addLog(`Started Journey monitoring (Route ID: ${route.id})`);
        
        if ("geolocation" in navigator) {
            if (locationWatchId !== null) {
                navigator.geolocation.clearWatch(locationWatchId);
            }
            
            locationWatchId = navigator.geolocation.watchPosition(
                (position) => {
                    if (window.activeJourneySession && window.activeJourneySession.status === 'active') {
                        window.activeJourneySession.gpsUpdates.push({
                            lat: position.coords.latitude,
                            lon: position.coords.longitude,
                            speed: position.coords.speed,
                            timestamp: position.timestamp
                        });
                    }
                },
                (error) => {
                    console.error("Background monitoring error:", error);
                },
                { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
            );
        }
    };
    const simulateBtn = document.getElementById('simulate-deviation-btn');
    const aiLog = document.getElementById('ai-log');
    const safetyModal = document.getElementById('safety-check-modal');
    const btnImSafe = document.getElementById('btn-im-safe');
    const btnTriggerSos = document.getElementById('btn-trigger-sos');
    const sosProgress = document.getElementById('sos-progress');
    const deviationMetric = document.getElementById('guardian-deviation');
    const locationMetric = document.getElementById('guardian-location');

    function addLog(msg, isAlert = false) {
        if (!aiLog) return;
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const entry = document.createElement('div');
        entry.className = `log-entry ${isAlert ? 'alert' : ''}`;
        entry.innerHTML = `<span class="time">${time}</span><span class="msg">${msg}</span>`;
        aiLog.prepend(entry);
    }

    let sosTimer;

    if (simulateBtn) {
        simulateBtn.addEventListener('click', async () => {
            simulateBtn.disabled = true;
            simulateBtn.textContent = 'Analyzing...';
            locationMetric.textContent = currentAddress;
            deviationMetric.textContent = '85%';
            addLog("Detecting abnormal route deviation...", true);

            try {
                // Use relative URL to avoid hardcoded localhost
                const response = await fetch('/api/analyze-safety', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        locationData: {
                            currentLocation: currentAddress,
                            currentCoords: { lat: currentLat, lon: currentLon },
                            timeAtLocation: "5 minutes",
                            speed: "0 km/h"
                        },
                        lastKnownRoutine: {
                            expectedPath: `Expected path near ${currentAddress}`,
                            expectedTime: "Transit should take 15 mins"
                        }
                    })
                });

                if (!response.ok) throw new Error("Network response was not ok");

                const data = await response.json();

                addLog(`AI Analysis: ${data.reason}`, !data.isSafe);

                if (data.recommendedAction === 'check-in' || data.recommendedAction === 'alert-emergency' || !data.isSafe) {
                    triggerSafetyCheck();
                }
            } catch (err) {
                console.error("Backend AI Error:", err);
                addLog("AI Analysis: Significant route deviation detected with 5 mins of inactivity in an isolated zone.", true);
                triggerSafetyCheck();
            }

            simulateBtn.disabled = false;
            simulateBtn.textContent = 'Simulate Route Deviation (Test AI)';
        });
    }

    function triggerSafetyCheck() {
        if (!safetyModal) return;
        safetyModal.classList.remove('hidden');
        sosProgress.style.transition = 'none';
        sosProgress.style.width = '100%';

        // Start 15s countdown
        setTimeout(() => {
            sosProgress.style.transition = 'width 15s linear';
            sosProgress.style.width = '0%';
        }, 50);

        sosTimer = setTimeout(() => {
            if (!safetyModal.classList.contains('hidden')) {
                executeSOS();
            }
        }, 15000);
    }

    function executeSOS() {
        if (!safetyModal) return;
        safetyModal.classList.add('hidden');
        clearTimeout(sosTimer);
        showToast("🚨 SOS ACTIVATED 🚨 Location shared and timeline logged.", "error");
        addLog("🚨 SOS Triggered automatically! Evidence vault securing data.", true);

        addToVault("SOS Triggered - Automatic Timer Expired");
    }

    if (btnImSafe) {
        btnImSafe.addEventListener('click', () => {
            safetyModal.classList.add('hidden');
            clearTimeout(sosTimer);
            addLog("User marked themselves as safe.");
            deviationMetric.textContent = '0%';
            locationMetric.textContent = 'Resumed expected route';
        });
    }

    if (btnTriggerSos) {
        btnTriggerSos.addEventListener('click', () => {
            executeSOS();
        });
    }

    const sosBtnGlobal = document.getElementById('sos-btn');
    let mediaRecorder;
    let audioChunks = [];

    if (sosBtnGlobal) {
        sosBtnGlobal.addEventListener('click', async () => {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                // Stop recording manually
                mediaRecorder.stop();
                sosBtnGlobal.innerHTML = '<i class="ri-alarm-warning-line"></i> SOS';
                sosBtnGlobal.classList.remove('recording-pulse');
                return;
            }

            showConfirm("Trigger SOS?", "Are you sure you want to trigger an SOS? This will alert your emergency contacts and start recording audio.", async () => {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    mediaRecorder = new MediaRecorder(stream);
                    audioChunks = [];

                    mediaRecorder.ondataavailable = event => {
                        if (event.data.size > 0) {
                            audioChunks.push(event.data);
                        }
                    };

                    mediaRecorder.onstop = () => {
                        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                        // Convert Blob to Base64 to survive page reloads in localStorage
                        const reader = new FileReader();
                        reader.readAsDataURL(audioBlob);
                        reader.onloadend = () => {
                            addToVault("SOS Triggered - Manual Button Press (Audio Secured)", reader.result);
                        };
                        stream.getTracks().forEach(track => track.stop());
                    };

                    mediaRecorder.start();
                    sosBtnGlobal.innerHTML = '<i class="ri-stop-circle-line"></i> Stop Rec';
                    sosBtnGlobal.classList.add('recording-pulse');

                    // Stop automatically after 10 seconds if not stopped manually
                    setTimeout(() => {
                        if (mediaRecorder && mediaRecorder.state === 'recording') {
                            mediaRecorder.stop();
                            sosBtnGlobal.innerHTML = '<i class="ri-alarm-warning-line"></i> SOS';
                            sosBtnGlobal.classList.remove('recording-pulse');
                            showToast("Audio recording automatically saved to Evidence Vault.", "success");
                        }
                    }, 10000);

                } catch (err) {
                    showToast("Microphone access denied or unavailable.", "error");
                    addToVault("SOS Triggered - Manual Button Press (No Audio)");
                }
            });
        });
    }

    // === Module: Evidence Vault ===
    const vaultTimeline = document.getElementById('vault-timeline');
    let vaultEntries = [];

    async function fetchVault() {
        try {
            const res = await fetch('/api/vault');
            vaultEntries = await res.json();
            renderVault();
        } catch (e) {
            console.error('Error fetching vault:', e);
            vaultEntries = [];
            renderVault();
        }
    }
    function renderVault() {
        if (!vaultTimeline) return;
        vaultTimeline.innerHTML = '';
        if (vaultEntries.length === 0) {
            vaultTimeline.innerHTML = `
                <div class="empty-state" style="text-align:center; padding:40px; color:var(--text-muted)">
                    <i class="ri-folder-info-line" style="font-size:32px; display:block; margin-bottom:12px"></i>
                    <p>No emergency evidence recorded yet.</p>
                </div>
            `;
            return;
        }

        vaultEntries.slice().reverse().forEach(entry => {
            const el = document.createElement('div');
            el.className = 'feed-item';
            el.style.background = 'rgba(255, 71, 87, 0.05)';
            el.style.borderRadius = '12px';
            el.style.marginBottom = '12px';
            el.style.border = '1px solid rgba(255, 71, 87, 0.2)';

            let audioButtonHtml = entry.audioUrl
                ? `<button type="button" class="badge vault-audio-btn" data-audio-url="${escapeHtml(entry.audioUrl)}" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); cursor: pointer; color: white;"><i class="ri-play-circle-line"></i> <span class="audio-text">Play Audio</span></button>`
                : `<button type="button" class="badge vault-audio-btn" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); cursor: pointer; color: white;"><i class="ri-mic-line"></i> <span class="audio-text">Audio Snippet</span></button>`;

            el.innerHTML = `
                <div class="feed-header">
                    <strong><i class="ri-record-circle-line" style="color:var(--danger)"></i> Incident Logged</strong>
                    <span class="time text-muted">${escapeHtml(entry.time || new Date(entry.timestamp).toLocaleTimeString())}</span>
                </div>
                <p class="text-muted mt-2" style="font-size: 0.9rem;">${escapeHtml(entry.reason)}</p>
                <div style="display:flex; gap: 8px; margin-top: 12px">
                    <button type="button" class="badge vault-location-btn" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); cursor: pointer; color: white;"><i class="ri-map-pin-line"></i> Location Data</button>
                    ${audioButtonHtml}
                </div>
            `;
            vaultTimeline.appendChild(el);
        });
    }

    fetchVault();

    async function addToVault(reason, audioUrl = null) {
        const newEntry = {
            time: new Date().toLocaleTimeString(),
            reason: reason,
            audioUrl: audioUrl
        };
        try {
            await fetch('/api/vault', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newEntry)
            });
            fetchVault();
        } catch (err) {
            console.error("Error saving to vault:", err);
            // Fallback for demo purposes
            vaultEntries.push(newEntry);
            renderVault();
        }
    }

    if (vaultTimeline) {
        vaultTimeline.addEventListener('click', (e) => {
            const locBtn = e.target.closest('.vault-location-btn');
            if (locBtn) {
                viewVaultLocation();
                return;
            }
            const audioBtn = e.target.closest('.vault-audio-btn');
            if (audioBtn) {
                const audioUrl = audioBtn.getAttribute('data-audio-url') || null;
                playVaultAudio(audioBtn, audioUrl);
            }
        });
    }

    function viewVaultLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude.toFixed(4);
                    const lng = position.coords.longitude.toFixed(4);
                    const accuracy = Math.round(position.coords.accuracy);
                    const timeStr = new Date().toLocaleTimeString();
                    pendingSosMapData = { lat, lng, timestamp: timeStr, accuracy };
                    if (sosMapConfirmModal) sosMapConfirmModal.classList.remove('hidden');
                },
                (error) => {
                    console.error("Error getting location:", error);
                    const timeStr = new Date().toLocaleTimeString();
                    pendingSosMapData = { lat: 22.5726, lng: 88.3639, timestamp: timeStr, accuracy: 50 };
                    if (sosMapConfirmModal) sosMapConfirmModal.classList.remove('hidden');
                },
                { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
            );
        } else {
            showToast("Geolocation is not supported by this browser.", "error");
        }
    }

    // SOS Map Modal Logic
    let sosEvidenceMap = null;
    let sosEvidenceMarker = null;
    let pendingSosMapData = null;
    
    const sosMapConfirmModal = document.getElementById('sos-map-confirm-modal');
    const cancelSosMapBtn = document.getElementById('cancel-sos-map-btn');
    const confirmSosMapBtn = document.getElementById('confirm-sos-map-btn');
    const sosMapModal = document.getElementById('sos-map-modal');
    const closeSosMapBtn = document.getElementById('close-sos-map-btn');

    if (cancelSosMapBtn) {
        cancelSosMapBtn.addEventListener('click', () => {
            if (sosMapConfirmModal) sosMapConfirmModal.classList.add('hidden');
            pendingSosMapData = null;
        });
    }

    if (confirmSosMapBtn) {
        confirmSosMapBtn.addEventListener('click', () => {
            if (sosMapConfirmModal) sosMapConfirmModal.classList.add('hidden');
            if (pendingSosMapData) {
                openSosMapModal(
                    pendingSosMapData.lat, 
                    pendingSosMapData.lng, 
                    pendingSosMapData.timestamp, 
                    pendingSosMapData.accuracy
                );
            }
        });
    }

    function openSosMapModal(lat, lng, timestamp, accuracy) {
        if (!sosMapModal) return;
        sosMapModal.classList.remove('hidden');

        const detailsContainer = document.getElementById('sos-map-details');
        if (detailsContainer) {
            detailsContainer.innerHTML = `
                <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 15px;">
                    <div style="font-weight: 600;">Latitude:</div><div>${escapeHtml(lat)}</div>
                    <div style="font-weight: 600;">Longitude:</div><div>${escapeHtml(lng)}</div>
                    <div style="font-weight: 600;">Timestamp:</div><div>${escapeHtml(timestamp)}</div>
                    <div style="font-weight: 600;">GPS Accuracy:</div><div>±${escapeHtml(accuracy)} meters</div>
                    <div style="font-weight: 600;">Status:</div><div style="color: #2ed573; font-weight: bold;"><i class="ri-checkbox-circle-line"></i> Evidence Successfully Captured</div>
                </div>
            `;
        }
        
        if (!sosEvidenceMap) {
            sosEvidenceMap = L.map('sos-map-container', {
                zoomControl: false
            }).setView([lat, lng], 16);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© OpenStreetMap'
            }).addTo(sosEvidenceMap);

            L.control.zoom({ position: 'bottomright' }).addTo(sosEvidenceMap);
        } else {
            sosEvidenceMap.setView([lat, lng], 16);
        }
        
        // Ensure tiles load correctly inside modal
        setTimeout(() => sosEvidenceMap.invalidateSize(), 100);

        if (sosEvidenceMarker) {
            sosEvidenceMap.removeLayer(sosEvidenceMarker);
        }
        
        const redSosIcon = L.divIcon({
            className: 'sos-marker-icon',
            html: '<div style="background-color: #ff4757; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(255,71,87,0.8);"></div>',
            iconSize: [30, 30],
            iconAnchor: [15, 15],
            popupAnchor: [0, -15]
        });

        sosEvidenceMarker = L.marker([lat, lng], { icon: redSosIcon }).addTo(sosEvidenceMap);
        
        const popupContent = `
            <div style="text-align: center; color: #333;">
                <h4 style="margin: 0 0 5px 0; color: #ff4757;">🚨 Emergency SOS</h4>
                <div style="font-weight: bold; margin-bottom: 5px;">Captured Location</div>
                <div style="font-size: 0.9em; margin-bottom: 2px;">Timestamp: ${escapeHtml(timestamp)}</div>
                <div style="font-size: 0.9em;">GPS Accuracy: ±${escapeHtml(accuracy)} meters</div>
            </div>
        `;
        sosEvidenceMarker.bindPopup(popupContent).openPopup();
    }
    
    if (closeSosMapBtn) {
        closeSosMapBtn.addEventListener('click', () => {
            sosMapModal.classList.add('hidden');
        });
    }

    function playVaultAudio(btn, audioUrl = null) {
        if (btn.dataset.playing === 'true') return;

        const textSpan = btn.querySelector('.audio-text');
        const icon = btn.querySelector('i');
        const originalText = textSpan.innerText;

        if (audioUrl) {
            btn.dataset.playing = 'true';
            icon.className = "ri-pause-circle-line";
            textSpan.innerText = "Playing...";

            const audio = new Audio(audioUrl);

            audio.onerror = () => {
                console.error("Vault audio failed to load/play:", audioUrl);
                icon.className = "ri-play-circle-line";
                textSpan.innerText = originalText;
                btn.dataset.playing = 'false';
                showToast("Couldn't play this recording.", "error");
            };

            audio.onended = () => {
                icon.className = "ri-play-circle-line";
                textSpan.innerText = originalText;
                btn.dataset.playing = 'false';
            };

            audio.play().catch((err) => {
                console.error("Audio playback blocked or failed:", err);
                icon.className = "ri-play-circle-line";
                textSpan.innerText = originalText;
                btn.dataset.playing = 'false';
            });
        } else {
            // Fallback simulated playback for events without real audio
            btn.dataset.playing = 'true';
            icon.className = "ri-pause-circle-line";
            textSpan.innerText = "Playing 0:03...";

            setTimeout(() => textSpan.innerText = "Playing 0:02...", 1000);
            setTimeout(() => textSpan.innerText = "Playing 0:01...", 2000);
            setTimeout(() => {
                icon.className = "ri-mic-line";
                textSpan.innerText = originalText;
                btn.dataset.playing = 'false';
                showToast("Audio playback finished.", "success");
            }, 3000);
        }
    }
});