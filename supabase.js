// ============================================
// PIXLNEX - SECURE DATABASE LAYER
// ALL DATA STORED IN SUPABASE
// localStorage ONLY for SESSION MANAGEMENT
// ============================================

// ─── SUPABASE CONFIGURATION ───
const SUPABASE_URL = 'https://skdthncgjwtlydtgtjze.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_k1DV8-nVcr4o5LE8s_wbLA_O7BPQFpy';
const SUPABASE_BUCKET = 'product-images';

// ─── STATE ───
let supabaseClient = null;
let supabaseConnected = false;
let isInitialized = false;
let currentUser = null;

console.log('🚀 database.js loading...');

// ─── SECURITY FUNCTIONS ───

/**
 * Validates email address with strict regex
 * Prevents email injection attacks
 */
function validateEmail(email) {
    if (!email || typeof email !== 'string') return false;
    if (email.length > 254) return false;
    if (email.includes('..') || email.includes('@@')) return false;
    
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email);
}

/**
 * Validates password - EXACTLY 8 characters
 * Prevents SQL injection, command injection, and XSS in password field
 */
function validatePassword(password) {
    if (!password || typeof password !== 'string') return false;
    
    // Must be exactly 8 characters
    if (password.length !== 8) return false;
    
    // Only allow safe characters (no injection vectors)
    const allowedChars = /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]*$/;
    if (!allowedChars.test(password)) return false;
    
    // Block SQL injection patterns
    const sqlPatterns = /(\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bUNION\b|\b--\b|;|\bALTER\b|\bCREATE\b|\bEXEC\b)/i;
    if (sqlPatterns.test(password)) return false;
    
    // Block command injection patterns
    const cmdPatterns = /(\bexec\b|\bping\b|\bcurl\b|\bwget\b|\bnc\b|\bnetcat\b|\bbash\b|\bsh\b|\bcmd\b|\bpowershell\b)/i;
    if (cmdPatterns.test(password)) return false;
    
    // Block XSS patterns
    const xssPatterns = /(<script|javascript:|onerror=|onload=|onclick=)/i;
    if (xssPatterns.test(password)) return false;
    
    return true;
}

/**
 * Sanitizes user input to prevent XSS
 */
function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    // Remove HTML tags
    let sanitized = input.replace(/<[^>]*>/g, '');
    
    // Remove script tags and their content
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    // Remove event handlers
    sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
    
    // Remove javascript: protocol
    sanitized = sanitized.replace(/javascript:/gi, '');
    
    // Remove data: protocol (can be used for XSS)
    sanitized = sanitized.replace(/data:/gi, '');
    
    // Escape special characters
    const escapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;',
        '`': '&#96;'
    };
    
    return sanitized.replace(/[&<>"'/`]/g, function(m) { return escapeMap[m] || m; });
}

/**
 * Validates and sanitizes an object's string values
 */
function sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    const sanitized = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            if (typeof obj[key] === 'string') {
                sanitized[key] = sanitizeInput(obj[key]);
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                sanitized[key] = sanitizeObject(obj[key]);
            } else {
                sanitized[key] = obj[key];
            }
        }
    }
    return sanitized;
}

/**
 * Generates a secure random token for CSRF protection
 */
function generateCSRFToken() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Validates CSRF token
 */
function validateCSRFToken(token) {
    const storedToken = localStorage.getItem('pixlnex_csrf_token');
    if (!storedToken) return false;
    if (!token || typeof token !== 'string') return false;
    
    // Use timing-safe comparison
    let mismatch = 0;
    for (let i = 0; i < token.length && i < storedToken.length; i++) {
        mismatch |= (token.charCodeAt(i) ^ storedToken.charCodeAt(i));
    }
    if (token.length !== storedToken.length) return false;
    
    return mismatch === 0;
}

// ─── RATE LIMITING ───
const rateLimits = {};

/**
 * Rate limiting to prevent brute force attacks
 */
function checkRateLimit(key, maxRequests, timeWindow) {
    const now = Date.now();
    
    if (!rateLimits[key]) {
        rateLimits[key] = { 
            count: 1, 
            firstRequest: now,
            lastRequest: now
        };
        return true;
    }
    
    const limit = rateLimits[key];
    limit.lastRequest = now;
    
    // Reset counter if time window has passed
    if (now - limit.firstRequest > timeWindow) {
        limit.count = 1;
        limit.firstRequest = now;
        return true;
    }
    
    if (limit.count >= maxRequests) {
        return false;
    }
    
    limit.count++;
    return true;
}

/**
 * Get client IP from headers (for rate limiting)
 */
function getClientIP() {
    // Try to get from localStorage first (set by server)
    const storedIP = localStorage.getItem('pixlnex_client_ip');
    if (storedIP) return storedIP;
    
    // Fallback to a unique identifier based on localStorage
    let clientId = localStorage.getItem('pixlnex_client_id');
    if (!clientId) {
        clientId = 'client_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
        localStorage.setItem('pixlnex_client_id', clientId);
    }
    return clientId;
}

// ─── INIT ───

/**
 * Initialize Supabase connection
 */
function initSupabase() {
    if (isInitialized) return supabaseClient;
    
    try {
        if (typeof supabase !== 'undefined') {
            // Create client with secure options
            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: {
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: true,
                    storage: {
                        getItem: function(key) {
                            return localStorage.getItem(key);
                        },
                        setItem: function(key, value) {
                            localStorage.setItem(key, value);
                        },
                        removeItem: function(key) {
                            localStorage.removeItem(key);
                        }
                    }
                }
            });
            
            supabaseConnected = true;
            isInitialized = true;
            
            // Generate CSRF token if not exists
            if (!localStorage.getItem('pixlnex_csrf_token')) {
                const token = generateCSRFToken();
                localStorage.setItem('pixlnex_csrf_token', token);
            }
            
            console.log('✅ Supabase connected successfully');
            return supabaseClient;
        } else {
            console.error('❌ Supabase SDK not loaded');
            supabaseConnected = false;
            return null;
        }
    } catch (e) {
        console.error('❌ Supabase error:', e);
        supabaseConnected = false;
        return null;
    }
}

// ─── HELPERS ───

/**
 * Format amount in PKR
 */
function formatPKR(amount) {
    return '₨ ' + (amount || 0).toLocaleString('en-PK');
}

/**
 * Wait for Supabase to be connected
 */
function waitForSupabase(timeout = 5000) {
    return new Promise((resolve) => {
        if (supabaseConnected && supabaseClient) {
            resolve(true);
            return;
        }
        
        let attempts = 0;
        const maxAttempts = Math.ceil(timeout / 200);
        const check = () => {
            if (supabaseConnected && supabaseClient) {
                resolve(true);
                return;
            }
            attempts++;
            if (attempts > maxAttempts) {
                resolve(false);
                return;
            }
            setTimeout(check, 200);
        };
        
        if (!isInitialized) {
            initSupabase();
        }
        check();
    });
}

// ─── AUTH FUNCTIONS ───

/**
 * Get current user with session validation
 * DATA SOURCE: Supabase Auth + Supabase Users Table
 * localStorage: ONLY for session caching (not primary data store)
 */
async function getCurrentUser() {
    if (!supabaseConnected || !supabaseClient) {
        console.warn('⚠️ Supabase not connected');
        return null;
    }
    
    try {
        // Check rate limit
        const clientId = getClientIP();
        if (!checkRateLimit('auth_' + clientId, 50, 60000)) {
            console.warn('⚠️ Auth rate limit exceeded');
            return null;
        }
        
        // PRIMARY: Check Supabase session first
        const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
        
        if (sessionError) {
            console.error('Session error:', sessionError);
            return null;
        }
        
        if (!sessionData.session) {
            // FALLBACK: Check localStorage for session cache
            const storedUser = localStorage.getItem('pixlnex_user_secure');
            if (storedUser) {
                try {
                    const userData = JSON.parse(storedUser);
                    const expectedSig = btoa(userData.id + userData.email + 'pixlnex_secret_salt');
                    if (userData._sig === expectedSig) {
                        return {
                            id: userData.id,
                            email: userData.email,
                            user_metadata: { full_name: userData.name },
                            created_at: userData.created_at,
                            _cached: true
                        };
                    }
                } catch(e) {
                    console.warn('Stored user data invalid');
                    localStorage.removeItem('pixlnex_user_secure');
                }
            }
            return null;
        }
        
        // PRIMARY: Get user from Supabase
        const { data, error } = await supabaseClient.auth.getUser();
        
        if (error) {
            console.error('Get user error:', error);
            return null;
        }
        
        if (data.user) {
            // Cache user data in localStorage for faster subsequent loads
            const userData = {
                id: data.user.id,
                email: data.user.email,
                name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'User',
                created_at: data.user.created_at,
                _sig: btoa(data.user.id + data.user.email + 'pixlnex_secret_salt'),
                _cached: false
            };
            localStorage.setItem('pixlnex_user_secure', JSON.stringify(userData));
            
            if (!localStorage.getItem('pixlnex_csrf_token')) {
                localStorage.setItem('pixlnex_csrf_token', generateCSRFToken());
            }
            
            currentUser = data.user;
            return data.user;
        }
        
        return null;
    } catch (e) {
        console.error('Get user error:', e);
        return null;
    }
}

/**
 * Sign in user with security checks
 * DATA SOURCE: Supabase Auth
 */
async function signInUser(email, password) {
    if (!supabaseConnected || !supabaseClient) {
        throw new Error('Supabase not connected');
    }
    
    if (!validateEmail(email)) {
        throw new Error('Invalid email format');
    }
    
    if (!validatePassword(password)) {
        throw new Error('Password must be exactly 8 characters with safe characters only');
    }
    
    const clientId = getClientIP();
    if (!checkRateLimit('login_' + clientId, 5, 300000)) {
        throw new Error('Too many login attempts. Please try again later.');
    }
    
    const sanitizedEmail = sanitizeInput(email.trim());
    
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: sanitizedEmail,
            password: password
        });
        
        if (error) throw error;
        
        if (data.user) {
            const userData = {
                id: data.user.id,
                email: data.user.email,
                name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0],
                created_at: data.user.created_at,
                _sig: btoa(data.user.id + data.user.email + 'pixlnex_secret_salt'),
                _cached: false
            };
            localStorage.setItem('pixlnex_user_secure', JSON.stringify(userData));
            localStorage.setItem('pixlnex_csrf_token', generateCSRFToken());
            currentUser = data.user;
        }
        
        return data;
    } catch (e) {
        console.error('Login error:', e);
        throw e;
    }
}

/**
 * Sign up user with security checks
 * DATA SOURCE: Supabase Auth + Supabase Users Table
 */
async function signUpUser(email, password, userData) {
    if (!supabaseConnected || !supabaseClient) {
        throw new Error('Supabase not connected');
    }
    
    if (!validateEmail(email)) {
        throw new Error('Invalid email format');
    }
    
    if (!validatePassword(password)) {
        throw new Error('Password must be exactly 8 characters with safe characters only');
    }
    
    const sanitizedUserData = sanitizeObject(userData);
    const sanitizedEmail = sanitizeInput(email.trim());
    
    try {
        // PRIMARY: Create user in Supabase Auth
        const { data, error } = await supabaseClient.auth.signUp({
            email: sanitizedEmail,
            password: password,
            options: {
                data: {
                    full_name: sanitizedUserData.full_name || sanitizedUserData.name || 'User'
                }
            }
        });
        
        if (error) throw error;
        
        if (data.user) {
            try {
                await supabaseClient
                    .from('users')
                    .insert([{
                        id: data.user.id,
                        name: sanitizedUserData.full_name || sanitizedUserData.name || 'User',
                        email: sanitizedEmail,
                        created_at: new Date().toISOString()
                    }]);
            } catch (e) {
                console.warn('User record error:', e);
            }
            
            const userDataSecure = {
                id: data.user.id,
                email: data.user.email,
                name: sanitizedUserData.full_name || sanitizedUserData.name || 'User',
                created_at: data.user.created_at,
                _sig: btoa(data.user.id + data.user.email + 'pixlnex_secret_salt'),
                _cached: false
            };
            localStorage.setItem('pixlnex_user_secure', JSON.stringify(userDataSecure));
            localStorage.setItem('pixlnex_csrf_token', generateCSRFToken());
            
            currentUser = data.user;
        }
        
        return data;
    } catch (e) {
        console.error('Signup error:', e);
        throw e;
    }
}

/**
 * Sign out user with session cleanup
 */
async function signOutUser() {
    try {
        if (supabaseConnected && supabaseClient) {
            await supabaseClient.auth.signOut();
        }
    } catch (e) {
        console.error('Sign out error:', e);
    }
    
    localStorage.removeItem('pixlnex_user_secure');
    localStorage.removeItem('pixlnex_csrf_token');
    
    currentUser = null;
    
    window.location.href = 'login.html';
}

// ─── PRODUCT FUNCTIONS ───
async function getProducts() {
    if (!supabaseConnected || !supabaseClient) {
        console.warn('⚠️ Supabase not connected');
        return [];
    }
    
    const clientId = getClientIP();
    if (!checkRateLimit('products_' + clientId, 100, 60000)) {
        console.warn('⚠️ Products rate limit exceeded');
        return [];
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('products')
            .select('*')
            .order('created_at', { ascending: true });
        
        if (error) throw error;
        return (data || []).map(product => sanitizeObject(product));
    } catch (e) {
        console.error('Products error:', e);
        return [];
    }
}

/**
 * Get a single product by ID from Supabase
 */
async function getProductById(productId) {
    if (!supabaseConnected || !supabaseClient) return null;
    if (!productId) return null;
    
    try {
        const { data, error } = await supabaseClient
            .from('products')
            .select('*')
            .eq('id', productId)
            .single();
        
        if (error) throw error;
        return sanitizeObject(data);
    } catch (e) {
        console.error('Product error:', e);
        return null;
    }
}

/**
 * Create a new product in Supabase (admin only)
 */
async function createProduct(productData) {
    if (!supabaseConnected || !supabaseClient) {
        throw new Error('Supabase not connected');
    }
    
    if (!validateCSRFToken(productData.csrfToken)) {
        throw new Error('Invalid CSRF token');
    }
    
    const sanitizedData = sanitizeObject(productData);
    delete sanitizedData.csrfToken;
    
    try {
        const { data, error } = await supabaseClient
            .from('products')
            .insert([{
                name: sanitizedData.name,
                description: sanitizedData.description || sanitizedData.desc || '',
                price: sanitizedData.price || 0,
                category: sanitizedData.category || 'custom',
                category_label: sanitizedData.category_label || 'Custom',
                features: sanitizedData.features || [],
                image_urls: sanitizedData.image_urls || [],
                created_at: new Date().toISOString()
            }])
            .select();
        
        if (error) throw error;
        return data ? data[0] : null;
    } catch (e) {
        console.error('Create product error:', e);
        throw e;
    }
}

/**
 * Update a product in Supabase (admin only)
 */
async function updateProduct(productId, productData) {
    if (!supabaseConnected || !supabaseClient) {
        throw new Error('Supabase not connected');
    }
    
    if (!validateCSRFToken(productData.csrfToken)) {
        throw new Error('Invalid CSRF token');
    }
    
    const sanitizedData = sanitizeObject(productData);
    delete sanitizedData.csrfToken;
    delete sanitizedData.id;
    
    try {
        const { data, error } = await supabaseClient
            .from('products')
            .update({
                ...sanitizedData,
                updated_at: new Date().toISOString()
            })
            .eq('id', productId)
            .select();
        
        if (error) throw error;
        return data ? data[0] : null;
    } catch (e) {
        console.error('Update product error:', e);
        throw e;
    }
}

/**
 * Delete a product from Supabase (admin only)
 */
async function deleteProduct(productId, csrfToken) {
    if (!supabaseConnected || !supabaseClient) {
        throw new Error('Supabase not connected');
    }
    
    if (!validateCSRFToken(csrfToken)) {
        throw new Error('Invalid CSRF token');
    }
    
    try {
        const { error } = await supabaseClient
            .from('products')
            .delete()
            .eq('id', productId);
        
        if (error) throw error;
        return true;
    } catch (e) {
        console.error('Delete product error:', e);
        throw e;
    }
}

// ─── OFFER FUNCTIONS ───
async function getOfferStatus(offerType) {
    if (!supabaseConnected || !supabaseClient) return null;
    if (!offerType) return null;
    
    try {
        const { data, error } = await supabaseClient
            .from('offers')
            .select('*')
            .eq('offer_type', offerType)
            .single();
        
        if (error) throw error;
        return data;
    } catch (e) {
        console.error('Offer error:', e);
        return null;
    }
}

/**
 * Claim an offer - updates Supabase
 */
async function claimOffer(offerType, email, csrfToken) {
    if (!supabaseConnected || !supabaseClient) {
        throw new Error('Supabase not connected');
    }
    
    if (!validateCSRFToken(csrfToken)) {
        throw new Error('Invalid CSRF token');
    }
    
    if (!validateEmail(email)) {
        throw new Error('Invalid email format');
    }
    
    const sanitizedEmail = sanitizeInput(email.trim());
    
    const clientId = getClientIP();
    if (!checkRateLimit('claim_' + clientId, 5, 60000)) {
        throw new Error('Too many claim attempts. Please try again later.');
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('offers')
            .select('*')
            .eq('offer_type', offerType)
            .single();
        
        if (error) throw error;
        
        if (!data || data.is_active === false) {
            throw new Error('Offer not active');
        }
        
        const claimedArray = data.claimed_by ? data.claimed_by.split(',').filter(Boolean) : [];
        
        if (claimedArray.includes(sanitizedEmail)) {
            throw new Error('Already claimed this offer');
        }
        
        const adminEmails = ['faisalyousafyousaf3@gmail.com', 'noor@gmail.com'];
        const isAdmin = adminEmails.includes(sanitizedEmail.toLowerCase());
        
        if (!isAdmin && claimedArray.length >= data.total_limit) {
            throw new Error('Offer is fully claimed');
        }
        
        claimedArray.push(sanitizedEmail);
        
        const { error: updateError } = await supabaseClient
            .from('offers')
            .update({
                claimed_by: claimedArray.join(','),
                claimed_at: new Date().toISOString()
            })
            .eq('offer_type', offerType);
        
        if (updateError) throw updateError;
        
        return { success: true, claimed: true };
    } catch (e) {
        console.error('Claim offer error:', e);
        throw e;
    }
}

// ─── ORDER FUNCTIONS ───
async function createOrder(orderData) {
    if (!supabaseConnected || !supabaseClient) {
        throw new Error('Supabase not connected');
    }
    
    if (!validateCSRFToken(orderData.csrfToken)) {
        throw new Error('Invalid CSRF token');
    }
    
    if (orderData.customer_email && !validateEmail(orderData.customer_email)) {
        throw new Error('Invalid customer email');
    }
    
    const sanitizedData = sanitizeObject(orderData);
    delete sanitizedData.csrfToken;
    
    const orderId = '#ORD-' + Date.now().toString().slice(-6) + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    
    try {
        const { data, error } = await supabaseClient
            .from('orders')
            .insert([{
                order_id: orderId,
                name: sanitizedData.name || 'Web Package',
                price: sanitizedData.price || 0,
                customer_email: sanitizedData.customer_email || '',
                customer_name: sanitizedData.customer_name || '',
                payment_method: sanitizedData.payment_method || 'jazzcash',
                payment_status: sanitizedData.payment_status || 'pending',
                status: sanitizedData.status || 'processing',
                is_custom: sanitizedData.is_custom || false,
                custom_details: sanitizedData.custom_details || '',
                custom_type: sanitizedData.custom_type || '',
                custom_budget: sanitizedData.custom_budget || '',
                created_at: new Date().toISOString()
            }])
            .select();
        
        if (error) throw error;
        return data ? data[0] : null;
    } catch (e) {
        console.error('Order error:', e);
        throw e;
    }
}

/**
 * Get orders for a user from Supabase
 */
async function getUserOrders(email) {
    if (!supabaseConnected || !supabaseClient) return [];
    if (!validateEmail(email)) return [];
    
    const sanitizedEmail = sanitizeInput(email.trim());
    
    try {
        const { data, error } = await supabaseClient
            .from('orders')
            .select('*')
            .eq('customer_email', sanitizedEmail)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return (data || []).map(order => sanitizeObject(order));
    } catch (e) {
        console.error('User orders error:', e);
        return [];
    }
}

/**
 * Get all orders from Supabase (admin only)
 */
async function getAllOrders() {
    if (!supabaseConnected || !supabaseClient) return [];
    
    try {
        const { data, error } = await supabaseClient
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return (data || []).map(order => sanitizeObject(order));
    } catch (e) {
        console.error('All orders error:', e);
        return [];
    }
}

/**
 * Update order status in Supabase (admin only)
 */
async function updateOrderStatus(orderId, status, csrfToken) {
    if (!supabaseConnected || !supabaseClient) {
        throw new Error('Supabase not connected');
    }
    
    if (!validateCSRFToken(csrfToken)) {
        throw new Error('Invalid CSRF token');
    }
    
    const validStatuses = ['processing', 'working', 'demo_ready', 'completed', 'delivered'];
    if (!validStatuses.includes(status)) {
        throw new Error('Invalid order status');
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('orders')
            .update({
                status: status,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId)
            .select();
        
        if (error) throw error;
        return data ? data[0] : null;
    } catch (e) {
        console.error('Update order error:', e);
        throw e;
    }
}

// ─── USER FUNCTIONS ───
async function getUsers() {
    if (!supabaseConnected || !supabaseClient) return [];
    
    try {
        const { data, error } = await supabaseClient
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return (data || []).map(user => sanitizeObject(user));
    } catch (e) {
        console.error('Users error:', e);
        return [];
    }
}

/**
 * Get user by ID from Supabase
 */
async function getUserById(userId) {
    if (!supabaseConnected || !supabaseClient) return null;
    if (!userId) return null;
    
    try {
        const { data, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (error) throw error;
        return sanitizeObject(data);
    } catch (e) {
        console.error('User error:', e);
        return null;
    }
}

// ─── EXPOSE ───

const PixlnexDB = {
    initSupabase,
    waitForSupabase,
    supabaseClient,
    supabaseConnected,
    isInitialized,
    currentUser,
    
    validateEmail,
    validatePassword,
    sanitizeInput,
    sanitizeObject,
    generateCSRFToken,
    validateCSRFToken,
    checkRateLimit,
    getClientIP,
    
    formatPKR,
    
    getCurrentUser,
    signInUser,
    signUpUser,
    signOutUser,
    
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    
    getOfferStatus,
    claimOffer,
    
    createOrder,
    getUserOrders,
    getAllOrders,
    updateOrderStatus,
    
    getUsers,
    getUserById,
    
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    SUPABASE_BUCKET
};

window.PixlnexDB = PixlnexDB;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PixlnexDB;
}

console.log('📦 PixlnexDB object created and exposed globally');

// ─── AUTO-INIT ───
setTimeout(() => {
    if (!isInitialized) {
        initSupabase();
    }
}, 100);

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    if (!isInitialized) initSupabase();
} else {
    document.addEventListener('DOMContentLoaded', function() {
        if (!isInitialized) initSupabase();
    });
}