const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { marked } = require('marked');
const hljs = require('highlight.js');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Data files path
const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');
const TAGS_FILE = path.join(DATA_DIR, 'tags.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Configure marked with highlight.js
marked.setOptions({
  highlight: function(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  },
  breaks: true,
  gfm: true
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads')));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: function(req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed!'));
  }
});

// Helper functions for JSON file operations
const readJSON = (filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
};

const writeJSON = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Optional auth middleware (doesn't fail if no token)
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (!err) {
        req.user = user;
      }
    });
  }
  next();
};

// Generate unique ID
const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// ============ AUTH ROUTES ============

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({ error: 'Username must be 3-30 characters' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const users = readJSON(USERS_FILE);

    // Check if email already exists
    if (users.find(u => u.email === email)) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Check if username already exists
    if (users.find(u => u.username === username)) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      id: generateId(),
      username,
      email,
      password: hashedPassword,
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${username}`,
      bio: '',
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    writeJSON(USERS_FILE, users);

    const token = jwt.sign({ id: newUser.id, username: newUser.username }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        avatar: newUser.avatar,
        bio: newUser.bio
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.email === email);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, (req, res) => {
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === req.user.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    bio: user.bio,
    createdAt: user.createdAt
  });
});

// ============ POSTS ROUTES ============

// Get all posts with pagination
app.get('/api/posts', optionalAuth, (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const tag = req.query.tag;
    const category = req.query.category;

    let posts = readJSON(POSTS_FILE);

    // Filter by tag
    if (tag) {
      posts = posts.filter(p => p.tags && p.tags.includes(tag));
    }

    // Filter by category
    if (category) {
      posts = posts.filter(p => p.category === category);
    }

    // Sort by createdAt descending
    posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const totalPosts = posts.length;
    const totalPages = Math.ceil(totalPosts / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    posts = posts.slice(startIndex, endIndex).map(post => {
      const postData = { ...post };
      // Don't send markdown content in list view, just excerpt
      if (postData.content && postData.content.length > 200) {
        postData.excerpt = postData.content.substring(0, 200) + '...';
      }
      delete postData.content;
      return postData;
    });

    res.json({
      posts,
      pagination: {
        page,
        limit,
        totalPosts,
        totalPages
      }
    });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ error: 'Server error fetching posts' });
  }
});

// Get single post
app.get('/api/posts/:id', optionalAuth, (req, res) => {
  try {
    const posts = readJSON(POSTS_FILE);
    const post = posts.find(p => p.id === req.params.id);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Render markdown content
    post.htmlContent = marked(post.content || '');

    // Get comment count
    const comments = readJSON(COMMENTS_FILE);
    post.commentCount = comments.filter(c => c.postId === post.id).length;

    // Check if current user has liked the post
    if (req.user) {
      post.isLiked = post.likes && post.likes.includes(req.user.id);
    }

    res.json(post);
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ error: 'Server error fetching post' });
  }
});

// Create post
app.post('/api/posts', authenticateToken, (req, res) => {
  try {
    const { title, content, excerpt, category, tags, coverImage } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const posts = readJSON(POSTS_FILE);
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id === req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const newPost = {
      id: generateId(),
      title,
      content,
      excerpt: excerpt || (content.length > 200 ? content.substring(0, 200) + '...' : content),
      category: category || 'General',
      tags: tags || [],
      coverImage: coverImage || null,
      authorId: user.id,
      authorUsername: user.username,
      authorAvatar: user.avatar,
      likes: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    posts.push(newPost);
    writeJSON(POSTS_FILE, posts);

    // Update tags
    updateTags(tags, category);

    res.status(201).json(newPost);
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Server error creating post' });
  }
});

// Update post
app.put('/api/posts/:id', authenticateToken, (req, res) => {
  try {
    const { title, content, excerpt, category, tags, coverImage } = req.body;

    const posts = readJSON(POSTS_FILE);
    const postIndex = posts.findIndex(p => p.id === req.params.id);

    if (postIndex === -1) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (posts[postIndex].authorId !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own posts' });
    }

    posts[postIndex] = {
      ...posts[postIndex],
      title: title || posts[postIndex].title,
      content: content || posts[postIndex].content,
      excerpt: excerpt || posts[postIndex].excerpt,
      category: category || posts[postIndex].category,
      tags: tags || posts[postIndex].tags,
      coverImage: coverImage !== undefined ? coverImage : posts[postIndex].coverImage,
      updatedAt: new Date().toISOString()
    };

    writeJSON(POSTS_FILE, posts);

    // Update tags
    updateTags(tags, category);

    res.json(posts[postIndex]);
  } catch (error) {
    console.error('Update post error:', error);
    res.status(500).json({ error: 'Server error updating post' });
  }
});

// Delete post
app.delete('/api/posts/:id', authenticateToken, (req, res) => {
  try {
    const posts = readJSON(POSTS_FILE);
    const postIndex = posts.findIndex(p => p.id === req.params.id);

    if (postIndex === -1) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (posts[postIndex].authorId !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own posts' });
    }

    posts.splice(postIndex, 1);
    writeJSON(POSTS_FILE, posts);

    // Delete associated comments
    let comments = readJSON(COMMENTS_FILE);
    comments = comments.filter(c => c.postId !== req.params.id);
    writeJSON(COMMENTS_FILE, comments);

    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: 'Server error deleting post' });
  }
});

// Like/unlike post
app.post('/api/posts/:id/like', authenticateToken, (req, res) => {
  try {
    const posts = readJSON(POSTS_FILE);
    const postIndex = posts.findIndex(p => p.id === req.params.id);

    if (postIndex === -1) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const post = posts[postIndex];
    const userId = req.user.id;

    if (!post.likes) {
      post.likes = [];
    }

    const likeIndex = post.likes.indexOf(userId);

    if (likeIndex === -1) {
      // Like
      post.likes.push(userId);
    } else {
      // Unlike
      post.likes.splice(likeIndex, 1);
    }

    posts[postIndex] = post;
    writeJSON(POSTS_FILE, posts);

    res.json({
      likes: post.likes.length,
      isLiked: likeIndex === -1
    });
  } catch (error) {
    console.error('Like post error:', error);
    res.status(500).json({ error: 'Server error processing like' });
  }
});

// ============ COMMENTS ROUTES ============

// Get comments for a post
app.get('/api/posts/:id/comments', (req, res) => {
  try {
    const comments = readJSON(COMMENTS_FILE);
    const postComments = comments.filter(c => c.postId === req.params.id);

    // Sort by createdAt ascending (oldest first)
    postComments.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    res.json(postComments);
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Server error fetching comments' });
  }
});

// Add comment to a post
app.post('/api/posts/:id/comments', authenticateToken, (req, res) => {
  try {
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    const posts = readJSON(POSTS_FILE);
    const post = posts.find(p => p.id === req.params.id);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id === req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const comments = readJSON(COMMENTS_FILE);

    const newComment = {
      id: generateId(),
      postId: req.params.id,
      authorId: user.id,
      authorUsername: user.username,
      authorAvatar: user.avatar,
      content: content.trim(),
      createdAt: new Date().toISOString()
    };

    comments.push(newComment);
    writeJSON(COMMENTS_FILE, comments);

    res.status(201).json(newComment);
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Server error adding comment' });
  }
});

// Delete comment
app.delete('/api/comments/:id', authenticateToken, (req, res) => {
  try {
    const comments = readJSON(COMMENTS_FILE);
    const commentIndex = comments.findIndex(c => c.id === req.params.id);

    if (commentIndex === -1) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (comments[commentIndex].authorId !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own comments' });
    }

    comments.splice(commentIndex, 1);
    writeJSON(COMMENTS_FILE, comments);

    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ error: 'Server error deleting comment' });
  }
});

// ============ TAGS/CATEGORIES ROUTES ============

// Get all tags with counts
app.get('/api/tags', (req, res) => {
  try {
    const tags = readJSON(TAGS_FILE);
    res.json(tags);
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ error: 'Server error fetching tags' });
  }
});

// Helper function to update tags
function updateTags(newTags, category) {
  if (!newTags && !category) return;

  let tags = readJSON(TAGS_FILE);

  // Update categories
  if (category) {
    const catIndex = tags.findIndex(t => t.name === category && t.type === 'category');
    if (catIndex === -1) {
      tags.push({
        name: category,
        type: 'category',
        count: 1
      });
    } else {
      tags[catIndex].count++;
    }
  }

  // Update tags
  if (newTags && Array.isArray(newTags)) {
    newTags.forEach(tagName => {
      const tagIndex = tags.findIndex(t => t.name === tagName && t.type === 'tag');
      if (tagIndex === -1) {
        tags.push({
          name: tagName,
          type: 'tag',
          count: 1
        });
      } else {
        tags[tagIndex].count++;
      }
    });
  }

  writeJSON(TAGS_FILE, tags);
}

// ============ SEARCH ROUTES ============

// Search posts
app.get('/api/search', optionalAuth, (req, res) => {
  try {
    const query = req.query.q || '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    if (query.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const posts = readJSON(POSTS_FILE);
    const queryLower = query.toLowerCase();

    let results = posts.filter(post => {
      const titleMatch = post.title && post.title.toLowerCase().includes(queryLower);
      const contentMatch = post.content && post.content.toLowerCase().includes(queryLower);
      const excerptMatch = post.excerpt && post.excerpt.toLowerCase().includes(queryLower);
      const authorMatch = post.authorUsername && post.authorUsername.toLowerCase().includes(queryLower);
      const tagMatch = post.tags && post.tags.some(t => t.toLowerCase().includes(queryLower));
      const categoryMatch = post.category && post.category.toLowerCase().includes(queryLower);

      return titleMatch || contentMatch || excerptMatch || authorMatch || tagMatch || categoryMatch;
    });

    // Sort by relevance (title matches first, then content)
    results.sort((a, b) => {
      const aTitle = (a.title && a.title.toLowerCase().includes(queryLower)) ? 1 : 0;
      const bTitle = (b.title && b.title.toLowerCase().includes(queryLower)) ? 1 : 0;
      return bTitle - aTitle;
    });

    const totalResults = results.length;
    const totalPages = Math.ceil(totalResults / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    results = results.slice(startIndex, endIndex).map(post => {
      const postData = { ...post };
      if (postData.content && postData.content.length > 200) {
        postData.excerpt = postData.content.substring(0, 200) + '...';
      }
      delete postData.content;
      return postData;
    });

    res.json({
      results,
      pagination: {
        page,
        limit,
        totalResults,
        totalPages
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Server error during search' });
  }
});

// ============ USER PROFILE ROUTES ============

// Get user profile
app.get('/api/users/:username', optionalAuth, (req, res) => {
  try {
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.username === req.params.username);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const posts = readJSON(POSTS_FILE);
    const userPosts = posts.filter(p => p.authorId === user.id);
    const totalLikes = userPosts.reduce((sum, p) => sum + (p.likes ? p.likes.length : 0), 0);

    res.json({
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      bio: user.bio,
      createdAt: user.createdAt,
      postCount: userPosts.length,
      totalLikes
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ error: 'Server error fetching user profile' });
  }
});

// Get user's posts
app.get('/api/users/:username/posts', optionalAuth, (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.username === req.params.username);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let posts = readJSON(POSTS_FILE);
    posts = posts.filter(p => p.authorId === user.id);

    posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const totalPosts = posts.length;
    const totalPages = Math.ceil(totalPosts / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    posts = posts.slice(startIndex, endIndex).map(post => {
      const postData = { ...post };
      if (postData.content && postData.content.length > 200) {
        postData.excerpt = postData.content.substring(0, 200) + '...';
      }
      delete postData.content;
      return postData;
    });

    res.json({
      posts,
      pagination: {
        page,
        limit,
        totalPosts,
        totalPages
      }
    });
  } catch (error) {
    console.error('Get user posts error:', error);
    res.status(500).json({ error: 'Server error fetching user posts' });
  }
});

// Update user profile
app.put('/api/users/profile', authenticateToken, (req, res) => {
  try {
    const { bio, avatar } = req.body;

    const users = readJSON(USERS_FILE);
    const userIndex = users.findIndex(u => u.id === req.user.id);

    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (bio !== undefined) {
      users[userIndex].bio = bio;
    }
    if (avatar !== undefined) {
      users[userIndex].avatar = avatar;
    }

    writeJSON(USERS_FILE, users);

    res.json({
      id: users[userIndex].id,
      username: users[userIndex].username,
      email: users[userIndex].email,
      avatar: users[userIndex].avatar,
      bio: users[userIndex].bio
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Server error updating profile' });
  }
});

// ============ UPLOAD ROUTE ============

app.post('/api/upload', authenticateToken, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ url: imageUrl });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Server error during upload' });
  }
});

// ============ CATCH-ALL ROUTE FOR SPA ============

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Blog server running on http://localhost:${PORT}`);
});

module.exports = app;
