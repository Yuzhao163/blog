// ==================== App Configuration ====================
const API_BASE = '/api';
const ITEMS_PER_PAGE = 10;

// ==================== State Management ====================
const state = {
  user: null,
  token: localStorage.getItem('token'),
  theme: localStorage.getItem('theme') || 'light',
  simpleMDE: null
};

// ==================== API Helpers ====================
const api = {
  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (state.token) {
      headers['Authorization'] = `Bearer ${state.token}`;
    }

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  get(endpoint) {
    return this.request(endpoint);
  },

  post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },

  put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  },

  del(endpoint) {
    return this.request(endpoint, {
      method: 'DELETE'
    });
  }
};

// ==================== Router ====================
const router = {
  routes: {},

  register(path, handler) {
    this.routes[path] = handler;
  },

  async navigate(path) {
    // Handle query params
    const [pathname, query] = path.split('?');
    const params = new URLSearchParams(query || '');

    // Extract route pattern
    for (const [pattern, handler] of Object.entries(this.routes)) {
      const match = this.matchRoute(pattern, pathname);
      if (match) {
        window.location.hash = path;
        await handler({ ...match.params, query: Object.fromEntries(params) });
        return;
      }
    }

    // 404
    this.renderNotFound();
  },

  matchRoute(pattern, pathname) {
    const patternParts = pattern.split('/');
    const pathParts = pathname.split('/');

    if (patternParts.length !== pathParts.length) {
      return null;
    }

    const params = {};

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = pathParts[i];
      } else if (patternParts[i] !== pathParts[i]) {
        return null;
      }
    }

    return { params };
  },

  renderNotFound() {
    const template = document.getElementById('notFoundTemplate');
    const content = template.content.cloneNode(true);
    document.getElementById('mainContent').innerHTML = '';
    document.getElementById('mainContent').appendChild(content);
    window.scrollTo(0, 0);
  },

  getCurrentPath() {
    const hash = window.location.hash.slice(1) || '/';
    return hash.startsWith('/') ? hash : '/' + hash;
  }
};

// ==================== Toast Notifications ====================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    info: 'fa-info-circle'
  };

  toast.innerHTML = `
    <i class="fas ${icons[type]}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==================== Theme Management ====================
function initTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  updateThemeIcon();
}

function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('theme', state.theme);
  updateThemeIcon();
}

function updateThemeIcon() {
  const icon = document.querySelector('#themeToggle i');
  icon.className = state.theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
}

// ==================== Auth Management ====================
async function checkAuth() {
  if (!state.token) {
    state.user = null;
    updateNavAuth();
    return;
  }

  try {
    state.user = await api.get('/auth/me');
    updateNavAuth();
  } catch (error) {
    logout();
  }
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('token');
  updateNavAuth();
  showToast('Logged out successfully', 'success');
  router.navigate('/');
}

function updateNavAuth() {
  const navAuth = document.getElementById('navAuth');

  if (state.user) {
    navAuth.innerHTML = `
      <div class="user-menu">
        <img src="${state.user.avatar}" alt="${state.user.username}" class="user-avatar">
        <div class="user-dropdown">
          <a href="#/profile/${state.user.username}"><i class="fas fa-user"></i> Profile</a>
          <a href="#/create"><i class="fas fa-plus"></i> New Post</a>
          <button onclick="logout()"><i class="fas fa-sign-out-alt"></i> Logout</button>
        </div>
      </div>
    `;
  } else {
    navAuth.innerHTML = `
      <a href="#/login"><i class="fas fa-sign-in-alt"></i> Login</a>
      <a href="#/register"><i class="fas fa-user-plus"></i> Register</a>
    `;
  }
}

// ==================== Page Renderers ====================

// Home Page
router.register('/', async ({ query }) => {
  const page = parseInt(query.page) || 1;
  const category = query.category || '';

  showLoading();

  try {
    let endpoint = `/posts?page=${page}&limit=${ITEMS_PER_PAGE}`;
    if (category) endpoint += `&category=${encodeURIComponent(category)}`;

    const data = await api.get(endpoint);
    renderHomePage(data, page, category);
    loadCategories();
  } catch (error) {
    showToast(error.message, 'error');
    renderHomePage({ posts: [], pagination: { page: 1, totalPages: 0, totalPosts: 0 } }, 1, '');
  }
});

function renderHomePage(data, page, category) {
  const template = document.getElementById('homeTemplate');
  const content = template.content.cloneNode(true);

  const postsGrid = content.getElementById('postsGrid');
  const pagination = content.getElementById('pagination');
  const heroActions = content.getElementById('heroActions');

  // Hero actions
  if (state.user) {
    heroActions.innerHTML = `
      <a href="#/create" class="btn"><i class="fas fa-plus"></i> Write a Post</a>
      <a href="#/profile/${state.user.username}" class="btn"><i class="fas fa-user"></i> My Profile</a>
    `;
  } else {
    heroActions.innerHTML = `
      <a href="#/register" class="btn"><i class="fas fa-user-plus"></i> Get Started</a>
      <a href="#/login" class="btn"><i class="fas fa-sign-in-alt"></i> Login</a>
    `;
  }

  // Posts
  if (data.posts.length === 0) {
    postsGrid.innerHTML = `
      <div class="no-posts" style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">
        <i class="fas fa-newspaper" style="font-size: 3rem; margin-bottom: 1rem;"></i>
        <p>No posts yet. Be the first to write one!</p>
      </div>
    `;
  } else {
    postsGrid.innerHTML = data.posts.map(post => renderPostCard(post)).join('');
  }

  // Pagination
  if (data.pagination.totalPages > 1) {
    pagination.innerHTML = renderPagination(page, data.pagination.totalPages, `/?page=`, category);
  }

  document.getElementById('mainContent').innerHTML = '';
  document.getElementById('mainContent').appendChild(content);
  window.scrollTo(0, 0);
}

function renderPostCard(post) {
  const excerpt = post.excerpt || (post.content ? post.content.substring(0, 200) + '...' : '');
  const date = new Date(post.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  return `
    <article class="post-card">
      <div class="post-card-image">
        ${post.coverImage
          ? `<img src="${post.coverImage}" alt="${post.title}">`
          : `<div class="no-image"><i class="fas fa-image"></i></div>`
        }
      </div>
      <div class="post-card-content">
        <div class="post-card-meta">
          <span><i class="fas fa-calendar"></i> ${date}</span>
          ${post.category ? `<span><i class="fas fa-folder"></i> ${post.category}</span>` : ''}
        </div>
        <h3 class="post-card-title">
          <a href="#/post/${post.id}">${post.title}</a>
        </h3>
        <p class="post-card-excerpt">${excerpt}</p>
        <div class="post-card-footer">
          <div class="post-card-tags">
            ${(post.tags || []).slice(0, 3).map(tag => `<span class="tag">${tag}</span>`).join('')}
          </div>
          <div class="post-card-actions">
            <button class="${post.isLiked ? 'liked' : ''}" onclick="handleLike('${post.id}', event)" title="Like">
              <i class="fas fa-heart"></i> ${post.likes ? post.likes.length : 0}
            </button>
            <span title="Comments">
              <i class="fas fa-comment"></i> ${post.commentCount || 0}
            </span>
          </div>
        </div>
      </div>
    </article>
  `;
}

// Post Detail Page
router.register('/post/:id', async ({ id }) => {
  showLoading();

  try {
    const post = await api.get(`/posts/${id}`);
    const comments = await api.get(`/posts/${id}/comments`);
    renderPostDetailPage(post, comments);
  } catch (error) {
    showToast(error.message, 'error');
    router.renderNotFound();
  }
});

function renderPostDetailPage(post, comments) {
  const template = document.getElementById('postDetailTemplate');
  const content = template.content.cloneNode(true);

  const article = content.getElementById('postArticle');
  const commentForm = content.getElementById('commentForm');
  const commentsList = content.getElementById('commentsList');
  const commentCount = content.getElementById('commentCount');

  const date = new Date(post.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const isOwner = state.user && state.user.id === post.authorId;

  article.innerHTML = `
    ${post.coverImage ? `<img src="${post.coverImage}" alt="${post.title}" class="post-cover">` : ''}
    <div class="post-header">
      <h1 class="post-title">${post.title}</h1>
      <div class="post-meta">
        <a href="#/profile/${post.authorUsername}">
          <img src="${post.authorAvatar}" alt="${post.authorUsername}">
          <span>${post.authorUsername}</span>
        </a>
        <span><i class="fas fa-calendar"></i> ${date}</span>
        ${post.category ? `<span><i class="fas fa-folder"></i> ${post.category}</span>` : ''}
        <span><i class="fas fa-heart"></i> ${post.likes ? post.likes.length : 0} likes</span>
      </div>
      ${post.tags && post.tags.length > 0 ? `
        <div class="post-tags">
          ${post.tags.map(tag => `<a href="#/tag/${tag}" class="tag">${tag}</a>`).join('')}
        </div>
      ` : ''}
    </div>
    <div class="post-content">
      ${post.htmlContent}
    </div>
    <div class="post-actions">
      <button class="like-button ${post.isLiked ? 'liked' : ''}" onclick="handlePostLike('${post.id}')">
        <i class="${post.isLiked ? 'fas' : 'far'} fa-heart"></i>
        ${post.isLiked ? 'Liked' : 'Like'} (${post.likes ? post.likes.length : 0})
      </button>
      ${isOwner ? `
        <div>
          <a href="#/edit/${post.id}" class="btn btn-secondary btn-sm"><i class="fas fa-edit"></i> Edit</a>
          <button class="btn btn-danger btn-sm" onclick="handleDeletePost('${post.id}')"><i class="fas fa-trash"></i> Delete</button>
        </div>
      ` : ''}
    </div>
  `;

  // Comments
  commentCount.textContent = comments.length;

  if (state.user) {
    commentForm.innerHTML = `
      <form onsubmit="handleAddComment(event, '${post.id}')">
        <textarea id="commentContent" placeholder="Write a comment..." required></textarea>
        <button type="submit" class="btn btn-primary"><i class="fas fa-paper-plane"></i> Post Comment</button>
      </form>
    `;
  } else {
    commentForm.innerHTML = `
      <div class="login-prompt">
        <a href="#/login">Login</a> to leave a comment
      </div>
    `;
  }

  if (comments.length === 0) {
    commentsList.innerHTML = `
      <p style="text-align: center; color: var(--text-muted); padding: 2rem;">
        No comments yet. Be the first to comment!
      </p>
    `;
  } else {
    commentsList.innerHTML = comments.map(comment => {
      const commentDate = new Date(comment.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      const isCommentOwner = state.user && state.user.id === comment.authorId;

      return `
        <div class="comment">
          <div class="comment-header">
            <div class="comment-author">
              <img src="${comment.authorAvatar}" alt="${comment.authorUsername}">
              <div class="comment-author-info">
                <h4><a href="#/profile/${comment.authorUsername}">${comment.authorUsername}</a></h4>
                <span>${commentDate}</span>
              </div>
            </div>
            ${isCommentOwner ? `
              <button onclick="handleDeleteComment('${comment.id}', '${post.id}')" class="btn btn-sm">
                <i class="fas fa-trash"></i>
              </button>
            ` : ''}
          </div>
          <p class="comment-content">${comment.content}</p>
        </div>
      `;
    }).join('');
  }

  document.getElementById('mainContent').innerHTML = '';
  document.getElementById('mainContent').appendChild(content);
  window.scrollTo(0, 0);
}

// Create Post Page
router.register('/create', async () => {
  if (!state.user) {
    showToast('Please login to create a post', 'error');
    router.navigate('/login');
    return;
  }

  const template = document.getElementById('createPostTemplate');
  const content = template.content.cloneNode(true);

  document.getElementById('mainContent').innerHTML = '';
  document.getElementById('mainContent').appendChild(content);

  // Initialize SimpleMDE
  if (state.simpleMDE) {
    state.simpleMDE.toTextArea();
  }
  state.simpleMDE = new SimpleMDE({
    element: document.getElementById('postContent'),
    placeholder: 'Write your post in Markdown...',
    spellChecker: false,
    status: false
  });

  // Preview button
  document.getElementById('previewBtn').addEventListener('click', () => {
    const previewContainer = document.getElementById('previewContainer');
    const previewContent = document.getElementById('previewContent');
    previewContainer.style.display = 'block';
    previewContent.innerHTML = marked.parse(state.simpleMDE.value());
  });

  // Form submit
  document.getElementById('postForm').addEventListener('submit', handleCreatePost);
  window.scrollTo(0, 0);
});

// Edit Post Page
router.register('/edit/:id', async ({ id }) => {
  if (!state.user) {
    showToast('Please login to edit a post', 'error');
    router.navigate('/login');
    return;
  }

  showLoading();

  try {
    const post = await api.get(`/posts/${id}`);

    if (post.authorId !== state.user.id) {
      showToast('You can only edit your own posts', 'error');
      router.navigate('/');
      return;
    }

    const template = document.getElementById('editPostTemplate');
    const content = template.content.cloneNode(true);

    document.getElementById('mainContent').innerHTML = '';
    document.getElementById('mainContent').appendChild(content);

    // Fill form
    document.getElementById('editTitle').value = post.title;
    document.getElementById('editCategory').value = post.category || '';
    document.getElementById('editTags').value = (post.tags || []).join(', ');
    document.getElementById('editCover').value = post.coverImage || '';

    // Initialize SimpleMDE
    if (state.simpleMDE) {
      state.simpleMDE.toTextArea();
    }
    state.simpleMDE = new SimpleMDE({
      element: document.getElementById('editContent'),
      placeholder: 'Write your post in Markdown...',
      spellChecker: false,
      status: false
    });
    state.simpleMDE.value(post.content);

    // Form submit
    document.getElementById('editForm').addEventListener('submit', (e) => handleEditPost(e, id));

  } catch (error) {
    showToast(error.message, 'error');
    router.navigate('/');
  }
});

// Login Page
router.register('/login', async () => {
  if (state.user) {
    router.navigate('/');
    return;
  }

  const template = document.getElementById('loginTemplate');
  const content = template.content.cloneNode(true);

  document.getElementById('mainContent').innerHTML = '';
  document.getElementById('mainContent').appendChild(content);

  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  window.scrollTo(0, 0);
});

// Register Page
router.register('/register', async () => {
  if (state.user) {
    router.navigate('/');
    return;
  }

  const template = document.getElementById('registerTemplate');
  const content = template.content.cloneNode(true);

  document.getElementById('mainContent').innerHTML = '';
  document.getElementById('mainContent').appendChild(content);

  document.getElementById('registerForm').addEventListener('submit', handleRegister);
  window.scrollTo(0, 0);
});

// Profile Page
router.register('/profile/:username', async ({ username }) => {
  showLoading();

  try {
    const user = await api.get(`/users/${username}`);
    const page = 1;
    const postsData = await api.get(`/users/${username}/posts?page=${page}&limit=${ITEMS_PER_PAGE}`);

    renderProfilePage(user, postsData, page);
  } catch (error) {
    showToast(error.message, 'error');
    router.renderNotFound();
  }
});

function renderProfilePage(user, postsData, page) {
  const template = document.getElementById('profileTemplate');
  const content = template.content.cloneNode(true);

  const profileAvatar = content.getElementById('profileAvatar');
  const profileUsername = content.getElementById('profileUsername');
  const profileBio = content.getElementById('profileBio');
  const profilePostCount = content.getElementById('profilePostCount');
  const profileTotalLikes = content.getElementById('profileTotalLikes');
  const profileJoinedDate = content.getElementById('profileJoinedDate');
  const profilePostsBy = content.getElementById('profilePostsBy');
  const profilePostsGrid = content.getElementById('profilePostsGrid');
  const profilePagination = content.getElementById('profilePagination');

  profileAvatar.src = user.avatar;
  profileAvatar.alt = user.username;
  profileUsername.textContent = user.username;
  profileBio.textContent = user.bio || 'No bio yet';
  profilePostCount.textContent = user.postCount;
  profileTotalLikes.textContent = user.totalLikes;
  profileJoinedDate.textContent = new Date(user.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long'
  });
  profilePostsBy.textContent = user.username;

  if (postsData.posts.length === 0) {
    profilePostsGrid.innerHTML = `
      <p style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 2rem;">
        No posts yet.
      </p>
    `;
  } else {
    profilePostsGrid.innerHTML = postsData.posts.map(post => renderPostCard(post)).join('');
  }

  if (postsData.pagination.totalPages > 1) {
    profilePagination.innerHTML = renderPagination(
      page,
      postsData.pagination.totalPages,
      `#/profile/${user.username}?page=`
    );
  }

  document.getElementById('mainContent').innerHTML = '';
  document.getElementById('mainContent').appendChild(content);
  window.scrollTo(0, 0);
}

// Tags Page
router.register('/tags', async () => {
  showLoading();

  try {
    const tags = await api.get('/tags');

    const template = document.getElementById('tagsTemplate');
    const content = template.content.cloneNode(true);

    const categoriesList = content.getElementById('categoriesList');
    const tagsList = content.getElementById('tagsList');

    const categories = tags.filter(t => t.type === 'category');
    const allTags = tags.filter(t => t.type === 'tag');

    categoriesList.innerHTML = categories.map(cat => `
      <a href="#/?category=${encodeURIComponent(cat.name)}" class="tag-item">
        <i class="fas fa-folder"></i>
        <span>${cat.name}</span>
        <span class="count">${cat.count}</span>
      </a>
    `).join('');

    tagsList.innerHTML = allTags.map(tag => `
      <a href="#/tag/${encodeURIComponent(tag.name)}" class="tag-item">
        <i class="fas fa-tag"></i>
        <span>${tag.name}</span>
        <span class="count">${tag.count}</span>
      </a>
    `).join('');

    document.getElementById('mainContent').innerHTML = '';
    document.getElementById('mainContent').appendChild(content);
    window.scrollTo(0, 0);
  } catch (error) {
    showToast(error.message, 'error');
  }
});

// Tag Posts Page
router.register('/tag/:tag', async ({ tag }) => {
  showLoading();

  try {
    const decodedTag = decodeURIComponent(tag);
    const data = await api.get(`/posts?tag=${encodeURIComponent(decodedTag)}&limit=${ITEMS_PER_PAGE}`);

    const template = document.getElementById('tagPostsTemplate');
    const content = template.content.cloneNode(true);

    const tagName = content.getElementById('tagName');
    const tagPostsGrid = content.getElementById('tagPostsGrid');
    const tagPostsPagination = content.getElementById('tagPostsPagination');

    tagName.textContent = decodedTag;

    if (data.posts.length === 0) {
      tagPostsGrid.innerHTML = `
        <p style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 2rem;">
          No posts found with this tag.
        </p>
      `;
    } else {
      tagPostsGrid.innerHTML = data.posts.map(post => renderPostCard(post)).join('');
    }

    if (data.pagination.totalPages > 1) {
      tagPostsPagination.innerHTML = renderPagination(
        data.pagination.page,
        data.pagination.totalPages,
        `#/tag/${encodeURIComponent(decodedTag)}?page=`
      );
    }

    document.getElementById('mainContent').innerHTML = '';
    document.getElementById('mainContent').appendChild(content);
    window.scrollTo(0, 0);
  } catch (error) {
    showToast(error.message, 'error');
  }
});

// Search Page
router.register('/search', async ({ query }) => {
  const q = query.q || '';
  const page = parseInt(query.page) || 1;

  if (q.length < 2) {
    router.navigate('/');
    return;
  }

  showLoading();

  try {
    const data = await api.get(`/search?q=${encodeURIComponent(q)}&page=${page}&limit=${ITEMS_PER_PAGE}`);

    const template = document.getElementById('searchTemplate');
    const content = template.content.cloneNode(true);

    const searchQuery = content.getElementById('searchQuery');
    const searchResults = content.getElementById('searchResults');
    const searchPagination = content.getElementById('searchPagination');

    searchQuery.textContent = `Showing results for "${q}" (${data.pagination.totalResults} found)`;

    if (data.results.length === 0) {
      searchResults.innerHTML = `
        <p style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 2rem;">
          No results found. Try different keywords.
        </p>
      `;
    } else {
      searchResults.innerHTML = data.results.map(post => renderPostCard(post)).join('');
    }

    if (data.pagination.totalPages > 1) {
      searchPagination.innerHTML = renderPagination(
        page,
        data.pagination.totalPages,
        `#/search?q=${encodeURIComponent(q)}&page=`
      );
    }

    document.getElementById('mainContent').innerHTML = '';
    document.getElementById('mainContent').appendChild(content);
    window.scrollTo(0, 0);
  } catch (error) {
    showToast(error.message, 'error');
  }
});

// ==================== Event Handlers ====================

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const data = await api.post('/auth/login', { email, password });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('token', state.token);
    updateNavAuth();
    showToast('Login successful!', 'success');
    router.navigate('/');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('registerUsername').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;

  try {
    const data = await api.post('/auth/register', { username, email, password });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('token', state.token);
    updateNavAuth();
    showToast('Registration successful!', 'success');
    router.navigate('/');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleCreatePost(e) {
  e.preventDefault();

  const title = document.getElementById('postTitle').value;
  const category = document.getElementById('postCategory').value;
  const tagsStr = document.getElementById('postTags').value;
  const coverImage = document.getElementById('postCover').value;
  const content = state.simpleMDE.value();

  const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(t => t) : [];

  try {
    const data = await api.post('/posts', { title, content, category, tags, coverImage });
    showToast('Post created successfully!', 'success');
    router.navigate(`/post/${data.id}`);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleEditPost(e, postId) {
  e.preventDefault();

  const title = document.getElementById('editTitle').value;
  const category = document.getElementById('editCategory').value;
  const tagsStr = document.getElementById('editTags').value;
  const coverImage = document.getElementById('editCover').value;
  const content = state.simpleMDE.value();

  const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(t => t) : [];

  try {
    await api.put(`/posts/${postId}`, { title, content, category, tags, coverImage });
    showToast('Post updated successfully!', 'success');
    router.navigate(`/post/${postId}`);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleDeletePost(postId) {
  if (!confirm('Are you sure you want to delete this post?')) return;

  try {
    await api.del(`/posts/${postId}`);
    showToast('Post deleted successfully!', 'success');
    router.navigate('/');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handlePostLike(postId) {
  if (!state.user) {
    showToast('Please login to like posts', 'error');
    router.navigate('/login');
    return;
  }

  try {
    const data = await api.post(`/posts/${postId}/like`);
    const likeBtn = document.querySelector('.like-button');
    likeBtn.classList.toggle('liked', data.isLiked);
    likeBtn.innerHTML = `
      <i class="${data.isLiked ? 'fas' : 'far'} fa-heart"></i>
      ${data.isLiked ? 'Liked' : 'Like'} (${data.likes})
    `;
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleLike(postId, event) {
  event.preventDefault();
  event.stopPropagation();

  if (!state.user) {
    showToast('Please login to like posts', 'error');
    router.navigate('/login');
    return;
  }

  try {
    await api.post(`/posts/${postId}/like`);
    // Refresh the page to update like count
    router.navigate(router.getCurrentPath());
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleAddComment(e, postId) {
  e.preventDefault();
  const content = document.getElementById('commentContent').value;

  try {
    await api.post(`/posts/${postId}/comments`, { content });
    showToast('Comment added!', 'success');
    router.navigate(`/post/${postId}`);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleDeleteComment(commentId, postId) {
  if (!confirm('Are you sure you want to delete this comment?')) return;

  try {
    await api.del(`/comments/${commentId}`);
    showToast('Comment deleted!', 'success');
    router.navigate(`/post/${postId}`);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadCategories() {
  try {
    const tags = await api.get('/tags');
    const categories = tags.filter(t => t.type === 'category');
    const categoryFilter = document.getElementById('categoryFilter');

    if (categoryFilter) {
      categoryFilter.innerHTML = `
        <option value="">All Categories</option>
        ${categories.map(cat => `
          <option value="${cat.name}">${cat.name}</option>
        `).join('')}
      `;

      categoryFilter.addEventListener('change', (e) => {
        const category = e.target.value;
        router.navigate(`/?category=${encodeURIComponent(category)}`);
      });
    }
  } catch (error) {
    console.error('Failed to load categories:', error);
  }
}

// ==================== Utility Functions ====================

function showLoading() {
  document.getElementById('mainContent').innerHTML = '<div class="loading"></div>';
}

function renderPagination(currentPage, totalPages, baseUrl) {
  let html = '';

  // Previous button
  html += `<button ${currentPage === 1 ? 'disabled' : ''} onclick="router.navigate('${baseUrl}${currentPage - 1}')">
    <i class="fas fa-chevron-left"></i>
  </button>`;

  // Page numbers
  const maxVisible = 5;
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);

  if (end - start < maxVisible - 1) {
    start = Math.max(1, end - maxVisible + 1);
  }

  if (start > 1) {
    html += `<button onclick="router.navigate('${baseUrl}1')">1</button>`;
    if (start > 2) html += `<span class="page-info">...</span>`;
  }

  for (let i = start; i <= end; i++) {
    html += `<button class="${i === currentPage ? 'active' : ''}" onclick="router.navigate('${baseUrl}${i}')">${i}</button>`;
  }

  if (end < totalPages) {
    if (end < totalPages - 1) html += `<span class="page-info">...</span>`;
    html += `<button onclick="router.navigate('${baseUrl}${totalPages}')">${totalPages}</button>`;
  }

  // Next button
  html += `<button ${currentPage === totalPages ? 'disabled' : ''} onclick="router.navigate('${baseUrl}${currentPage + 1}')">
    <i class="fas fa-chevron-right"></i>
  </button>`;

  return html;
}

// ==================== Search Form ====================
document.getElementById('searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const query = document.getElementById('searchInput').value.trim();
  if (query.length >= 2) {
    router.navigate(`/search?q=${encodeURIComponent(query)}`);
    document.getElementById('searchInput').value = '';
  } else {
    showToast('Please enter at least 2 characters', 'error');
  }
});

// ==================== Mobile Menu ====================
document.getElementById('mobileToggle').addEventListener('click', () => {
  document.getElementById('navMenu').classList.toggle('active');
});

// ==================== Theme Toggle ====================
document.getElementById('themeToggle').addEventListener('click', toggleTheme);

// ==================== Hash Change Handler ====================
window.addEventListener('hashchange', () => {
  router.navigate(router.getCurrentPath());
});

// ==================== Initialize App ====================
async function init() {
  initTheme();
  await checkAuth();
  router.navigate(router.getCurrentPath());
}

init();
