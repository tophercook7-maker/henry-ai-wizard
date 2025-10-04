// Import Tauri API if available
let invoke, open, readTextFile;
try {
    const tauriApi = await import('@tauri-apps/api/tauri');
    const tauriDialog = await import('@tauri-apps/api/dialog');
    const tauriFs = await import('@tauri-apps/api/fs');
    
    invoke = tauriApi.invoke;
    open = tauriDialog.open;
    readTextFile = tauriFs.readTextFile;
} catch (error) {
    console.log('Running in web mode - Tauri APIs not available');
}

class HenryAI {
    constructor() {
        this.currentSessionId = null;
        this.isLoading = false;
        this.isListening = false;
        this.sidebarCollapsed = false;
        this.sidebarWidth = 280;
        this.voiceRecognition = null;
        this.connectedApps = new Set(['notion', 'google-drive', 'github', 'calendar', 'vscode', 'email', 'terminal']);
        
        this.initializeApp();
    }

    async initializeApp() {
        console.log('🤖 Initializing Henry AI...');
        this.setupEventListeners();
        this.setupSidebar();
        this.setupVoiceControl();
        this.loadConversations();
        this.loadConnectedApps();
        this.loadStats();
        this.setupWindowControls();
    }

    setupEventListeners() {
        // Sidebar toggle
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            this.toggleSidebar();
        });

        // Section headers (collapsible sections)
        document.querySelectorAll('.section-header').forEach(header => {
            header.addEventListener('click', (e) => {
                this.toggleSection(e.currentTarget);
            });
        });

        // Chat input
        const chatInput = document.getElementById('chatInput');
        const sendBtn = document.getElementById('sendBtn');
        
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        chatInput.addEventListener('input', (e) => {
            this.autoResize(e.target);
        });

        sendBtn.addEventListener('click', () => this.sendMessage());

        // Sidebar buttons
        document.getElementById('newChatBtn').addEventListener('click', () => this.newChat());
        document.getElementById('clearChatBtn').addEventListener('click', () => this.clearChat());

        // File operations
        document.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                this.handleFileAction(action);
            });
        });

        // Terminal
        const terminalInput = document.getElementById('terminalInput');
        terminalInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.executeTerminalCommand();
            }
        });

        // App categories
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchAppCategory(e.target.dataset.category);
            });
        });

        // Automation buttons
        document.querySelectorAll('[data-automation]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const automation = e.target.dataset.automation;
                this.runAutomation(automation);
            });
        });

        // Voice control
        document.getElementById('voiceToggleBtn').addEventListener('click', () => {
            this.toggleVoiceControl();
        });

        // Sidebar resize
        this.setupSidebarResize();
    }

    setupSidebar() {
        // Initialize all sections as expanded
        document.querySelectorAll('.section-content').forEach(content => {
            content.classList.remove('collapsed');
        });
        
        document.querySelectorAll('.section-header').forEach(header => {
            header.classList.remove('collapsed');
        });
    }

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        this.sidebarCollapsed = !this.sidebarCollapsed;
        
        if (this.sidebarCollapsed) {
            sidebar.classList.add('collapsed');
        } else {
            sidebar.classList.remove('collapsed');
        }
    }

    toggleSection(header) {
        const sectionName = header.dataset.section;
        const content = document.getElementById(`${sectionName}-content`);
        const arrow = header.querySelector('.section-arrow');
        
        const isCollapsed = content.classList.contains('collapsed');
        
        if (isCollapsed) {
            content.classList.remove('collapsed');
            header.classList.remove('collapsed');
            arrow.textContent = '▼';
        } else {
            content.classList.add('collapsed');
            header.classList.add('collapsed');
            arrow.textContent = '▶';
        }
    }

    async sendMessage() {
        if (this.isLoading) return;

        const chatInput = document.getElementById('chatInput');
        const message = chatInput.value.trim();
        
        if (!message) return;

        this.setLoading(true);
        this.updateStatus('Processing your request...');

        try {
            // Add user message to chat
            const userMessage = {
                role: 'user',
                content: message,
                timestamp: new Date().toISOString()
            };
            this.addMessageToChat(userMessage);

            // Process with AI (use Tauri backend if available, otherwise mock)
            let response;
            if (invoke) {
                response = await invoke('chat_with_ai', {
                    request: {
                        message: message,
                        sessionId: this.currentSessionId
                    }
                });
                this.currentSessionId = response.sessionId;
            } else {
                // Mock response for web version
                response = {
                    response: this.generateMockResponse(message),
                    sessionId: this.currentSessionId || Date.now().toString()
                };
                this.currentSessionId = response.sessionId;
            }
            
            // Add AI response to chat
            const aiMessage = {
                role: 'assistant',
                content: response.response,
                timestamp: new Date().toISOString()
            };
            this.addMessageToChat(aiMessage);

            this.saveConversation(message, response.response);
            this.updateStats();

            chatInput.value = '';
            this.autoResize(chatInput);
        } catch (error) {
            console.error('Failed to send message:', error);
            this.showError('Failed to send message. Please try again.');
        } finally {
            this.setLoading(false);
            this.updateStatus('Ready');
        }
    }

    generateMockResponse(message) {
        const responses = {
            file: "I can help you with file operations! I have access to your Desktop, Documents, and Downloads folders. What would you like me to do with your files?",
            terminal: "I can execute terminal commands for you. What command would you like me to run?",
            automate: "I can set up automation workflows for you. What task would you like me to automate?",
            app: "I can help you connect and manage your apps. Which app would you like to integrate?",
            default: `I understand you're asking about: "${message}". As your AI assistant, I can help you with file operations, terminal commands, app integrations, and automation tasks. How can I assist you today?`
        };

        const lowerMessage = message.toLowerCase();
        
        if (lowerMessage.includes('file') || lowerMessage.includes('folder')) {
            return responses.file;
        } else if (lowerMessage.includes('terminal') || lowerMessage.includes('command')) {
            return responses.terminal;
        } else if (lowerMessage.includes('automate') || lowerMessage.includes('automation')) {
            return responses.automate;
        } else if (lowerMessage.includes('app') || lowerMessage.includes('connect')) {
            return responses.app;
        } else {
            return responses.default;
        }
    }

    displayApps(category = 'all') {
        const appsList = document.getElementById('appsList');
        const apps = [
            { id: 'notion', name: 'Notion', icon: '📝', category: 'productivity', connected: true },
            { id: 'google-drive', name: 'Google Drive', icon: '📁', category: 'productivity', connected: true },
            { id: 'github', name: 'GitHub', icon: '🐙', category: 'development', connected: true },
            { id: 'vscode', name: 'VS Code', icon: '💻', category: 'development', connected: true },
            { id: 'slack', name: 'Slack', icon: '💬', category: 'communication', connected: false },
            { id: 'email', name: 'Email', icon: '📧', category: 'communication', connected: true },
        ];

        const filteredApps = category === 'all' ? apps : apps.filter(app => app.category === category);
        
        appsList.innerHTML = filteredApps.map(app => `
            <div class="app-item" data-app="${app.id}">
                <span class="app-icon">${app.icon}</span>
                <span class="app-name">${app.name}</span>
                <div class="app-status ${app.connected ? 'connected' : ''}"></div>
            </div>
        `).join('');

        // Add click handlers for apps
        appsList.querySelectorAll('.app-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const appId = e.currentTarget.dataset.app;
                this.handleAppClick(appId);
            });
        });
    }

    addMessageToChat(message) {
        const chatMessages = document.getElementById('chatMessages');
        
        // Remove welcome message if it exists
        const welcomeMessage = chatMessages.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }
        
        const messageElement = this.createMessageElement(message);
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    createMessageElement(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${message.role}`;
        
        const timestamp = new Date(message.timestamp).toLocaleTimeString();
        
        messageDiv.innerHTML = `
            <div class="message-content">${this.formatMessageContent(message.content)}</div>
            <div class="message-time">${timestamp}</div>
        `;
        
        return messageDiv;
    }

    formatMessageContent(content) {
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    updateStatus(status) {
        document.getElementById('statusText').textContent = status;
    }

    setLoading(loading) {
        this.isLoading = loading;
        const sendBtn = document.getElementById('sendBtn');
        const sendBtnText = document.getElementById('sendBtnText');
        const sendBtnLoader = document.getElementById('sendBtnLoader');
        
        sendBtn.disabled = loading;
        sendBtnText.style.display = loading ? 'none' : 'inline';
        sendBtnLoader.style.display = loading ? 'inline-block' : 'none';
    }

    loadConnectedApps() {
        this.displayApps();
    }

    loadStats() {
        try {
            const stats = JSON.parse(localStorage.getItem('henryStats') || '{"tasksToday": 0, "filesProcessed": 0, "commandsRun": 0}');
            document.getElementById('tasksToday').textContent = stats.tasksToday;
            document.getElementById('filesProcessed').textContent = stats.filesProcessed;
            document.getElementById('commandsRun').textContent = stats.commandsRun;
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    }

    updateStats(type = 'tasksToday') {
        const element = document.getElementById(type);
        const currentValue = parseInt(element.textContent) + 1;
        element.textContent = currentValue;
        
        // Save to localStorage
        const stats = JSON.parse(localStorage.getItem('henryStats') || '{"tasksToday": 0, "filesProcessed": 0, "commandsRun": 0}');
        stats[type] = currentValue;
        localStorage.setItem('henryStats', JSON.stringify(stats));
    }

    autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    newChat() {
        this.currentSessionId = null;
        document.getElementById('chatMessages').innerHTML = `
            <div class="welcome-message">
                <h3>Welcome to Henry AI</h3>
                <p>Your intelligent desktop assistant with file system access, terminal capabilities, and app integration.</p>
                <p>Use the sidebar to access different features, or simply start typing to chat with me.</p>
            </div>
        `;
        document.getElementById('currentChatTitle').textContent = 'Henry AI Assistant';
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new HenryAI();
});
