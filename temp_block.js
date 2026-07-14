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
