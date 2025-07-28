// app.js

// Configuration - IMPORTANT: This MUST match your live backend URL
const API_BASE_URL = "https://lustroom-downloader-backend.onrender.com/api/v1";

// --- Logic for login.html ---
if (document.getElementById('loginForm')) {
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMessageDiv = document.getElementById('errorMessage');
    const loadingMessageDiv = document.getElementById('loadingMessage');

    loginForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        if (!email || !password) {
            displayError("Please enter both email and password.");
            return;
        }

        showLoading(true);
        displayError("");

        try {
            const response = await fetch(`${API_BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email, password: password }),
            });

            const data = await response.json();
            showLoading(false);

            if (response.ok && data.status === 'success' && data.access_token) {
                localStorage.setItem('lustroom_jwt', data.access_token);
                localStorage.setItem('lustroom_jwt_expires_in', data.expires_in);
                localStorage.setItem('lustroom_jwt_obtained_at', Math.floor(Date.now() / 1000));
                window.location.href = 'links.html';
            } else {
                displayError(data.message || "Login failed. Please check your credentials.");
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


// --- Logic for links.html (FINAL VERSION WITH FILTERING) ---
if (document.getElementById('linksContainer')) {
    const linksContainer = document.getElementById('linksContainer');
    const filterContainer = document.getElementById('filterContainer');
    const logoutButton = document.getElementById('logoutButton');
    const linksLoadingMessageDiv = document.getElementById('loadingMessageLinks');
    const linksErrorMessageDiv = document.getElementById('linksErrorMessage');

    function isTokenValid() {
        const token = localStorage.getItem('lustroom_jwt');
        const obtainedAt = parseInt(localStorage.getItem('lustroom_jwt_obtained_at'), 10);
        const expiresIn = parseInt(localStorage.getItem('lustroom_jwt_expires_in'), 10);

        if (!token || isNaN(obtainedAt) || isNaN(expiresIn)) {
            return false;
        }
        const nowInSeconds = Math.floor(Date.now() / 1000);
        return (obtainedAt + expiresIn - 60) > nowInSeconds;
    }
    
    async function fetchAndDisplayContent() {
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
                headers: { 'Authorization': `Bearer ${token}` },
            });

            const data = await response.json();
            showLinksLoading(false);

            if (response.ok && data.status === 'success' && data.content) {
                if (Object.keys(data.content).length === 0) {
                    linksContainer.innerHTML = '<p style="text-align:center; color: #777;">No new content available at the moment.</p>';
                } else {
                    renderContent(data.content);
                    setupFilters(data.content);
                }
            } else if (response.status === 401 || response.status === 403) {
                console.log("Token invalid or expired, redirecting to login.");
                localStorage.clear();
                window.location.href = 'login.html';
            } else {
                displayLinksError(data.message || "Failed to fetch content.");
            }
        } catch (error) {
            showLinksLoading(false);
            console.error("Fetch content error:", error);
            displayLinksError("An error occurred while fetching content. Please check your connection or try again later.");
        }
    }

    function renderContent(contentData) {
        linksContainer.innerHTML = ''; 

        for (const tierName in contentData) {
            const links = contentData[tierName];
            if (links.length === 0) continue;

            const tierGroup = document.createElement('div');
            tierGroup.className = 'tier-group';

            const tierTitle = document.createElement('h2');
            tierTitle.className = 'tier-title';
            tierTitle.textContent = tierName;
            tierGroup.appendChild(tierTitle);

            links.forEach(link => {
                const card = document.createElement('div');
                card.className = 'link-card';
                
                if (link.locked) {
                    card.classList.add('locked');
                }
                
                card.dataset.contentType = link.content_type || 'Video';

                if (link.thumbnail_url) {
                    const thumbnailContainer = document.createElement('div');
                    thumbnailContainer.className = 'thumbnail-container';
                    const thumbnailImage = document.createElement('img');
                    thumbnailImage.src = link.thumbnail_url;
                    thumbnailImage.alt = `Thumbnail for ${link.title}`;
                    thumbnailImage.loading = 'lazy';
                    thumbnailContainer.appendChild(thumbnailImage);
                    card.appendChild(thumbnailContainer);
                }

                const cardContent = document.createElement('div');
                cardContent.className = 'card-content';

                const title = document.createElement('h3');
                const titleLink = document.createElement('a');
                
                titleLink.href = link.url ? link.url : '#'; 
                if (!link.url) {
                    titleLink.style.cursor = 'default';
                }
                
                titleLink.textContent = link.title || "Untitled Link";
                titleLink.target = "_blank";
                title.appendChild(titleLink);
                cardContent.appendChild(title);

                if (link.description) {
                    const description = document.createElement('p');
                    description.textContent = link.description;
                    cardContent.appendChild(description);
                }
                
                const metaInfo = document.createElement('div');
                metaInfo.className = 'meta-info';
                
                if (link.category) {
                    const categorySpan = document.createElement('span');
                    categorySpan.innerHTML = `<strong>Category:</strong> ${link.category}`;
                    metaInfo.appendChild(categorySpan);
                }
                
                let dateToShow = link.updated_at || link.added_at;
                if (dateToShow) {
                    const dateSpan = document.createElement('span');
                    const localDate = new Date(dateToShow).toLocaleDateString();
                    dateSpan.innerHTML = `<strong>Date:</strong> ${localDate}`;
                    metaInfo.appendChild(dateSpan);
                }
                cardContent.appendChild(metaInfo);

                // *** NEW: Copy Button Implementation ***
                if (!link.locked) {
                    const actionsContainer = document.createElement('div');
                    actionsContainer.className = 'card-actions';

                    const copyButton = document.createElement('button');
                    copyButton.className = 'copy-btn';
                    copyButton.textContent = 'Copy Link';
                    copyButton.title = 'Copy content URL to clipboard';

                    copyButton.addEventListener('click', () => {
                        if (!link.url) return;
                        navigator.clipboard.writeText(link.url).then(() => {
                            copyButton.textContent = 'Copied! ✓';
                            copyButton.classList.add('copied');
                            copyButton.disabled = true;

                            setTimeout(() => {
                                copyButton.textContent = 'Copy Link';
                                copyButton.classList.remove('copied');
                                copyButton.disabled = false;
                            }, 2000);
                        }).catch(err => {
                            console.error('Failed to copy link: ', err);
                            copyButton.textContent = 'Copy Failed';
                             setTimeout(() => {
                                copyButton.textContent = 'Copy Link';
                            }, 2000);
                        });
                    });
                    actionsContainer.appendChild(copyButton);
                    cardContent.appendChild(actionsContainer);
                }
                
                card.appendChild(cardContent);
                tierGroup.appendChild(card);
            });

            linksContainer.appendChild(tierGroup);
        }
    }

    function setupFilters(contentData) {
        const contentTypes = new Set();
        Object.values(contentData).flat().forEach(link => {
            contentTypes.add(link.content_type || 'Video');
        });

        filterContainer.innerHTML = ''; 

        const allButton = document.createElement('button');
        allButton.className = 'filter-btn active';
        allButton.textContent = 'All';
        allButton.dataset.filter = 'All';
        filterContainer.appendChild(allButton);

        contentTypes.forEach(type => {
            const button = document.createElement('button');
            button.className = 'filter-btn';
            button.textContent = type;
            button.dataset.filter = type;
            filterContainer.appendChild(button);
        });

        filterContainer.addEventListener('click', handleFilterClick);
    }
    
    function handleFilterClick(event) {
        if (!event.target.classList.contains('filter-btn')) {
            return;
        }
        
        const filterValue = event.target.dataset.filter;

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.classList.add('active');

        applyFilter(filterValue);
    }

    function applyFilter(filter) {
        const cards = document.querySelectorAll('.link-card');
        cards.forEach(card => {
            if (filter === 'All' || card.dataset.contentType === filter) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });

        const tierGroups = document.querySelectorAll('.tier-group');
        tierGroups.forEach(group => {
            const visibleCard = group.querySelector('.link-card:not([style*="display: none"])');
            if (visibleCard) {
                group.style.display = 'block';
            } else {
                group.style.display = 'none';
            }
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
            localStorage.clear();
            window.location.href = 'login.html';
        });
    }

    document.addEventListener('DOMContentLoaded', fetchAndDisplayContent);
}