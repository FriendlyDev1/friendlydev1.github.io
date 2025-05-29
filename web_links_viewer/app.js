// app.js

// Configuration - IMPORTANT: This MUST match your live backend URL
const API_BASE_URL = "https://lustroom-downloader-backend.onrender.com/api/v1"; // REPLACE THIS with your actual Render backend URL + /api/v1

// --- Logic for login.html (Keep this existing part) ---
if (document.getElementById('loginForm')) {
    const loginForm = document.getElementById('loginForm');
    const licenseKeyInput = document.getElementById('licenseKey');
    const errorMessageDiv = document.getElementById('errorMessage');
    const loadingMessageDiv = document.getElementById('loadingMessage');

    loginForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        const licenseKey = licenseKeyInput.value.trim();
        if (!licenseKey) {
            displayError("Please enter a license key.");
            return;
        }
        showLoading(true);
        displayError("");
        try {
            const response = await fetch(`${API_BASE_URL}/auth_license`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ license_key: licenseKey }),
            });
            const data = await response.json();
            showLoading(false);
            if (response.ok && data.status === 'success' && data.access_token) {
                localStorage.setItem('lustroom_jwt', data.access_token);
                localStorage.setItem('lustroom_jwt_expires_in', data.expires_in);
                localStorage.setItem('lustroom_jwt_obtained_at', Math.floor(Date.now() / 1000));
                window.location.href = 'links.html';
            } else {
                displayError(data.message || "Login failed. Please check your license key.");
            }
        } catch (error) {
            showLoading(false);
            console.error("Login request error:", error);
            displayError("An error occurred while trying to log in. Please check your internet connection or try again later.");
        }
    });

    function displayError(message) {
        if (errorMessageDiv) {
            errorMessageDiv.textContent = message;
            errorMessageDiv.style.display = message ? 'block' : 'none';
        }
    }

    function showLoading(isLoading) {
        if (loadingMessageDiv) {
            loadingMessageDiv.style.display = isLoading ? 'block' : 'none';
        }
        if (loginForm) {
            const submitButton = loginForm.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.disabled = isLoading;
            }
        }
    }
}


// --- Logic for links.html (NEW PART) ---
if (document.getElementById('linksContainer')) {
    const linksContainer = document.getElementById('linksContainer');
    const logoutButton = document.getElementById('logoutButton');
    const linksLoadingMessageDiv = document.getElementById('loadingMessageLinks');
    const linksErrorMessageDiv = document.getElementById('linksErrorMessage');

    // Function to check if JWT is valid (simple expiry check)
    function isTokenValid() {
        const token = localStorage.getItem('lustroom_jwt');
        const obtainedAt = parseInt(localStorage.getItem('lustroom_jwt_obtained_at'), 10);
        const expiresIn = parseInt(localStorage.getItem('lustroom_jwt_expires_in'), 10);

        if (!token || isNaN(obtainedAt) || isNaN(expiresIn)) {
            return false;
        }
        const nowInSeconds = Math.floor(Date.now() / 1000);
        // Add a small buffer (e.g., 60 seconds) to consider token expired a bit earlier
        return (obtainedAt + expiresIn - 60) > nowInSeconds;
    }
    
    async function fetchAndDisplayLinks() {
        if (!isTokenValid()) {
            console.log("No valid token found, redirecting to login.");
            window.location.href = 'login.html';
            return;
        }

        showLinksLoading(true);
        displayLinksError("");

        try {
            const token = localStorage.getItem('lustroom_jwt');
            const response = await fetch(`${API_BASE_URL}/get_patron_links`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            const data = await response.json();
            showLinksLoading(false);

            if (response.ok && data.status === 'success' && data.links) {
                if (data.links.length === 0) {
                    linksContainer.innerHTML = '<p style="text-align:center; color: #777;">No new links available at the moment.</p>';
                } else {
                    renderLinks(data.links);
                }
            } else if (response.status === 401 || response.status === 403) { // Token expired or invalid
                console.log("Token invalid or expired, redirecting to login.");
                localStorage.removeItem('lustroom_jwt'); // Clear invalid token
                localStorage.removeItem('lustroom_jwt_expires_in');
                localStorage.removeItem('lustroom_jwt_obtained_at');
                window.location.href = 'login.html';
            } else {
                displayLinksError(data.message || "Failed to fetch links.");
            }
        } catch (error) {
            showLinksLoading(false);
            console.error("Fetch links error:", error);
            displayLinksError("An error occurred while fetching links. Please check your connection or try again later.");
        }
    }

    function renderLinks(links) {
        linksContainer.innerHTML = ''; // Clear previous links or loading message
        links.forEach(link => {
            const card = document.createElement('div');
            card.className = 'link-card'; // Use class from style.css

            const title = document.createElement('h3');
            const titleLink = document.createElement('a');
            titleLink.href = link.url;
            titleLink.textContent = link.title || "Untitled Link";
            titleLink.target = "_blank"; // Open in new tab
            title.appendChild(titleLink);
            card.appendChild(title);

            if (link.description) {
                const description = document.createElement('p');
                description.textContent = link.description;
                card.appendChild(description);
            }

            const urlP = document.createElement('p');
            const urlA = document.createElement('a');
            urlA.href = link.url;
            urlA.textContent = link.url.length > 70 ? link.url.substring(0, 67) + "..." : link.url;
            urlA.target = "_blank";
            urlA.title = link.url; // Full URL on hover
            urlP.appendChild(urlA);
            card.appendChild(urlP);
            
            const metaInfo = document.createElement('div');
            metaInfo.className = 'meta-info';
            
            if (link.category) {
                const categorySpan = document.createElement('span');
                categorySpan.innerHTML = `<strong>Category:</strong> ${link.category}`;
                metaInfo.appendChild(categorySpan);
            }

            let dateToShow = link.updated_at || link.added_at;
            let dateLabel = link.updated_at ? "Updated" : "Added";
            if (dateToShow) {
                const dateSpan = document.createElement('span');
                try {
                    // Dates from API are UTC 'Z' suffixed ISO strings
                    const localDate = new Date(dateToShow).toLocaleString();
                    dateSpan.innerHTML = `<strong>${dateLabel}:</strong> ${localDate}`;
                } catch (e) {
                    dateSpan.innerHTML = `<strong>${dateLabel}:</strong> ${dateToShow}`; // Fallback
                }
                metaInfo.appendChild(dateSpan);
            }
            card.appendChild(metaInfo);
            linksContainer.appendChild(card);
        });
    }

    function displayLinksError(message) {
        if (linksErrorMessageDiv) {
            linksErrorMessageDiv.textContent = message;
            linksErrorMessageDiv.style.display = message ? 'block' : 'none';
        }
    }

    function showLinksLoading(isLoading) {
        if (linksLoadingMessageDiv) {
            linksLoadingMessageDiv.style.display = isLoading ? 'block' : 'none';
        }
    }

    if (logoutButton) {
        logoutButton.addEventListener('click', function() {
            localStorage.removeItem('lustroom_jwt');
            localStorage.removeItem('lustroom_jwt_expires_in');
            localStorage.removeItem('lustroom_jwt_obtained_at');
            window.location.href = 'login.html';
        });
    }

    // Initial load of links when the page is ready
    document.addEventListener('DOMContentLoaded', fetchAndDisplayLinks);
}