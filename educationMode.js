/**
 * ============================================
 * EDUCATION MODE — Self-contained module
 * ============================================
 * Adds learning tools on top of any Chaka personality.
 * Teaching styles are client-side prompt presets.
 * All state persists in localStorage.
 */

window.EducationMode = (function () {
  'use strict';

  // ─── Teaching Style Definitions ───
  const TEACHING_STYLES = {
    friendly: {
      id: 'friendly',
      name: 'Friendly Mentor',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>',
      label: 'Default',
      prompt: `**TEACHING STYLE — Friendly Mentor:**
You are a warm, supportive tutor. Use analogies, real-world examples, and encouraging language.
When the student makes a mistake, gently guide them rather than criticize.
Celebrate small wins and progress. Make learning feel fun and achievable.
Use phrases like "Great question!", "You're on the right track!", and "Think of it this way..."`
    },
    strict: {
      id: 'strict',
      name: 'Strict Teacher',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="15" r="4"></circle><circle cx="18" cy="15" r="4"></circle><path d="M14 15a2 2 0 0 0-2-2 2 2 0 0 0-2 2"></path><path d="M2.5 13L5 7c.7-1.3 2.1-2 3.5-2h7c1.4 0 2.8.7 3.5 2l2.5 6"></path></svg>',
      label: '',
      prompt: `**TEACHING STYLE — Strict Teacher:**
You are a disciplined, no-nonsense instructor. Be direct and precise.
Demand accuracy. If the student is wrong, correct them firmly but fairly.
Push the student to think harder. Don't accept lazy answers.
Use structured explanations: definition → example → application.
Expect effort before giving answers. Ask "What do you think?" before explaining.`
    },
    exam: {
      id: 'exam',
      name: 'Exam Coach',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>',
      label: '',
      prompt: `**TEACHING STYLE — Exam Coach:**
You are an exam strategist. Focus on what matters for passing tests.
Teach exam techniques: elimination strategy, time allocation, answer structuring.
Highlight commonly tested topics and frequent question patterns.
Always relate explanations to how they'd appear in an exam.
Use phrases like "In an exam, they'd ask this as...", "The trick here is...", "Mark-scheme expects..."`
    },
    motivational: {
      id: 'motivational',
      name: 'Motivational Mentor',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>',
      label: '',
      prompt: `**TEACHING STYLE — Motivational Mentor:**
You are an energetic, confidence-boosting mentor. Every answer should inspire.
Remind the student they CAN do it. Share brief stories of perseverance when relevant.
Break large tasks into manageable chunks. Focus on progress, not perfection.
Use phrases like "You've got this!", "One step at a time", "Look how far you've come!"`
    },
    debater: {
      id: 'debater',
      name: 'The Debater',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 14 20 9 15 4"></polyline><path d="M4 20v-7a4 4 0 0 1 4-4h12"></path></svg>',
      label: 'New',
      prompt: `**TEACHING STYLE — The Debater (Socratic Method):**
You are a skilled debater who helps students sharpen their thinking.
Challenge every assertion: "But what about...", "Can you defend that?", "What's the counter-argument?"
Don't give answers directly — ask probing questions that lead the student to the answer.
Play devil's advocate. Present the opposing view, then ask the student to refute it.
This builds critical thinking, argumentation, and exam essay skills.`
    }
  };

  // ─── State ───
  let isActive = localStorage.getItem('eduModeActive') === 'true';
  let activeStyle = localStorage.getItem('eduModeStyle') || 'friendly';

  // ─── Core API ───

  function toggle() {
    isActive = !isActive;
    localStorage.setItem('eduModeActive', isActive);
    renderUI();
    return isActive;
  }

  function setStyle(styleId) {
    if (TEACHING_STYLES[styleId]) {
      activeStyle = styleId;
      localStorage.setItem('eduModeStyle', styleId);
      renderUI();
    }
  }

  function getSystemPromptInjection() {
    if (!isActive) return '';
    const style = TEACHING_STYLES[activeStyle] || TEACHING_STYLES.friendly;
    return `
--- EDUCATION MODE ACTIVE ---
${style.prompt}

**EDUCATION MODE CAPABILITIES:**
When the user asks for study help, you have these enhanced capabilities:
- Generate structured, exam-ready notes with definitions, bullet points, and key formulas
- Create quizzes with multiple choice, true/false, and short answer questions (always include answers)
- Generate flashcards in Q&A format
- Build productive study timetables with breaks and revision slots
- Provide practice questions for exam preparation
- Analyze topic difficulty and highlight important chapters
- Simplify complex concepts using stories and real-life examples (ELI10 mode)

**IMPORTANT:** 
- Always complete your full response. NEVER stop mid-way through a quiz, notes, or any educational content.
- If generating a list of questions, generate ALL of them with complete answers.
- Quality and completeness are critical — students depend on this for their exams.
--- END EDUCATION MODE ---
`;
  }

  // ─── UI Rendering ───

  function renderUI() {
    // Toggle button state
    const toggleEl = document.getElementById('edu-mode-toggle');
    if (toggleEl) {
      toggleEl.classList.toggle('active', isActive);
    }

    // Teaching styles panel
    const stylesPanel = document.getElementById('edu-teaching-styles');
    if (stylesPanel) {
      stylesPanel.classList.toggle('visible', isActive);
      // Update active state
      stylesPanel.querySelectorAll('.edu-style-item').forEach(item => {
        item.classList.toggle('active', item.dataset.style === activeStyle);
      });
    }

    // Toolbar
    const toolbar = document.getElementById('edu-toolbar');
    if (toolbar) toolbar.classList.toggle('visible', isActive);

    // Body class for ELI10 buttons
    document.body.classList.toggle('edu-active', isActive);
  }

  // ─── Sidebar HTML Generation ───

  function buildSidebarHTML() {
    let stylesHTML = '';
    for (const [id, style] of Object.entries(TEACHING_STYLES)) {
      const labelHTML = style.label ? `<span class="edu-style-label">${style.label}</span>` : '';
      stylesHTML += `
        <div class="edu-style-item ${id === activeStyle ? 'active' : ''}" data-style="${id}">
          <div class="edu-style-radio"></div>
          <span class="edu-style-icon">${style.icon}</span>
          <span class="edu-style-name">${style.name}</span>
          ${labelHTML}
        </div>`;
    }

    return `
      <div id="edu-mode-toggle" class="edu-mode-toggle ${isActive ? 'active' : ''}">
        <div class="edu-mode-toggle-label">
          <span class="edu-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>
          </span>
          <span>Education Mode</span>
        </div>
        <div class="edu-mode-switch"></div>
      </div>
      <div id="edu-teaching-styles" class="edu-teaching-styles ${isActive ? 'visible' : ''}">
        ${stylesHTML}
      </div>`;
  }

  // ─── Toolbar HTML ───

  function buildToolbarHTML() {
    return `
      <div id="edu-tools-wrapper" class="edu-tools-wrapper ${isActive ? 'visible' : ''}">
        <button id="edu-tools-toggle" class="icon-btn edu-icon-btn" title="Study Tools">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
            <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
          </svg>
        </button>
        <div id="edu-tools-popup" class="edu-tools-popup">
          <div class="edu-popup-header">Study Tools</div>
          <div class="edu-popup-grid">
            <button class="edu-tool-btn color-notes" data-tool="notes">
              <div class="edu-tool-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></div>
              <span>Notes</span>
            </button>
            <button class="edu-tool-btn color-quiz" data-tool="quiz">
              <div class="edu-tool-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></div>
              <span>Quiz</span>
            </button>
            <button class="edu-tool-btn color-flashcards" data-tool="flashcards">
              <div class="edu-tool-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg></div>
              <span>Flashcards</span>
            </button>
            <button class="edu-tool-btn color-timetable" data-tool="timetable">
              <div class="edu-tool-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg></div>
              <span>Timetable</span>
            </button>
            <button class="edu-tool-btn color-examprep" data-tool="examprep">
              <div class="edu-tool-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg></div>
              <span>Exam Prep</span>
            </button>
            <button class="edu-tool-btn color-eli10" data-tool="eli10">
              <div class="edu-tool-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><line x1="12" y1="2" x2="12" y2="4"></line><line x1="12" y1="20" x2="12" y2="22"></line><line x1="2" y1="12" x2="4" y2="12"></line><line x1="20" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"></line><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"></line><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"></line><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"></line></svg></div>
              <span>ELI10</span>
            </button>
          </div>
        </div>
      </div>`;
  }

  // ─── Toolkit Modal ───

  function showToolkitModal(tool) {
    // Remove any existing modal
    const existing = document.getElementById('edu-toolkit-modal');
    if (existing) existing.remove();

    const configs = {
      notes: {
        title: '📝 Generate Notes',
        placeholder: 'Enter topic (e.g. Photosynthesis, World War 2...)',
        hasSelect: false,
        getPrompt: (topic) => `Generate comprehensive, exam-ready study notes on "${topic}". Include:\n\n1. **Key Definitions** — Clear, concise definitions of all important terms\n2. **Core Concepts** — Explained in bullet points\n3. **Diagrams** — Describe what diagrams would look like in text\n4. **Key Formulas** — If applicable, list all relevant formulas\n5. **Summary** — 5 key points to remember\n\nMake the notes complete and thorough. Do NOT stop mid-way. This is for exam preparation.`
      },
      quiz: {
        title: '📊 Generate Quiz',
        placeholder: 'Enter topic for the quiz...',
        hasSelect: true,
        selectLabel: 'Difficulty',
        selectOptions: [
          { value: 'easy', text: 'Easy (Beginner)' },
          { value: 'medium', text: 'Medium (Intermediate)' },
          { value: 'hard', text: 'Hard (Advanced)' },
          { value: 'exam', text: 'Exam Level' }
        ],
        getPrompt: (topic, difficulty) => `Create a ${difficulty}-level quiz on "${topic}" with exactly 10 questions:\n\n- 5 Multiple Choice questions (A, B, C, D)\n- 3 True/False questions\n- 2 Short Answer questions\n\nAfter all questions, provide a complete **Answer Key** with explanations for each answer.\nDo NOT stop until all 10 questions AND all answers are complete.`
      },
      flashcards: {
        title: '🃏 Generate Flashcards',
        placeholder: 'Enter topic for flashcards...',
        hasSelect: false,
        getPrompt: (topic) => `Create 15 exam-focused flashcards on "${topic}".\n\nFormat each card as:\n**Card [number]**\n**Q:** [Question]\n**A:** [Concise answer]\n\nMake them concise, exam-relevant, and cover all important aspects of the topic. Complete ALL 15 cards.`
      },
      timetable: {
        title: '📅 Study Timetable',
        placeholder: 'Enter subjects (comma-separated, e.g. Math, Physics, English)',
        hasSelect: true,
        selectLabel: 'Hours per day',
        selectOptions: [
          { value: '2', text: '2 hours/day' },
          { value: '4', text: '4 hours/day' },
          { value: '6', text: '6 hours/day' },
          { value: '8', text: '8 hours/day (Intensive)' }
        ],
        getPrompt: (subjects, hours) => `Create a productive weekly study timetable for these subjects: ${subjects}.\n\nConstraints:\n- ${hours} hours of study per day\n- Include 10-minute breaks every 45 minutes\n- Include revision slots\n- Prioritize harder subjects in morning slots\n- Include a "free/catch-up" slot\n\nFormat as a clean markdown table with days and time slots. Make it realistic and achievable.`
      },
      examprep: {
        title: '🎯 Exam Preparation',
        placeholder: 'Enter subject for exam preparation...',
        hasSelect: true,
        selectLabel: 'Focus Area',
        selectOptions: [
          { value: 'practice', text: 'Practice Questions' },
          { value: 'important', text: 'Important Topics & Chapters' },
          { value: 'tips', text: 'Exam Tips & Strategy' },
          { value: 'full', text: 'Complete Exam Prep Pack' }
        ],
        getPrompt: (subject, focus) => {
          const focuses = {
            practice: `Generate 10 practice exam questions for "${subject}" with detailed solutions. Include a mix of easy, medium, and hard questions. Provide step-by-step solutions for each.`,
            important: `For "${subject}", analyze and provide:\n1. **Most Important Chapters** ranked by exam frequency\n2. **Expected Difficulty** rating for each topic (Easy/Medium/Hard)\n3. **Commonly Tested Concepts** — what examiners love to ask\n4. **Topics Students Usually Skip** (but shouldn't)\n5. **Quick-Win Topics** — easy marks that are often missed`,
            tips: `Provide comprehensive exam strategy for "${subject}":\n1. **Time Management** — how to allocate time per section\n2. **Answer Structuring** — how to write for maximum marks\n3. **Common Mistakes** — what to avoid\n4. **Last-Minute Revision** — what to focus on in the final hours\n5. **Exam Day Tips** — during the exam itself`,
            full: `Create a COMPLETE exam preparation pack for "${subject}":\n\n**Part 1: Important Topics**\n- Key chapters ranked by importance\n- Difficulty ratings\n\n**Part 2: Practice Questions** (5 questions with solutions)\n\n**Part 3: Key Formulas & Definitions**\n\n**Part 4: Exam Strategy**\n- Time management tips\n- Answer structuring advice\n\n**Part 5: Last-Minute Checklist**\n\nBe thorough and complete. Do NOT stop mid-way.`
          };
          return focuses[focus] || focuses.full;
        }
      }
    };

    const config = configs[tool];
    if (!config) return;

    let selectHTML = '';
    if (config.hasSelect) {
      const optionsHTML = config.selectOptions.map(o => `<option value="${o.value}">${o.text}</option>`).join('');
      selectHTML = `
        <label style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:4px;display:block;">${config.selectLabel}</label>
        <select class="edu-toolkit-select" id="edu-toolkit-select">${optionsHTML}</select>`;
    }

    const modalHTML = `
      <div id="edu-toolkit-modal" class="edu-toolkit-modal visible">
        <div class="edu-toolkit-panel">
          <div class="edu-toolkit-title">${config.title}</div>
          <input type="text" class="edu-toolkit-input" id="edu-toolkit-input" placeholder="${config.placeholder}" autofocus>
          ${selectHTML}
          <div class="edu-toolkit-actions">
            <button class="edu-toolkit-cancel" id="edu-toolkit-cancel">Cancel</button>
            <button class="edu-toolkit-submit" id="edu-toolkit-submit">Generate</button>
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Focus input
    setTimeout(() => document.getElementById('edu-toolkit-input')?.focus(), 100);

    // Initialize custom select UI if available
    const nativeSelect = document.getElementById('edu-toolkit-select');
    if (nativeSelect && window.initCustomSelect) {
      window.initCustomSelect(nativeSelect);
    }

    // Event handlers
    document.getElementById('edu-toolkit-cancel').onclick = () => {
      document.getElementById('edu-toolkit-modal')?.remove();
    };

    document.getElementById('edu-toolkit-modal').onclick = (e) => {
      if (e.target.id === 'edu-toolkit-modal') {
        document.getElementById('edu-toolkit-modal')?.remove();
      }
    };

    document.getElementById('edu-toolkit-submit').onclick = () => {
      const input = document.getElementById('edu-toolkit-input').value.trim();
      if (!input) {
        document.getElementById('edu-toolkit-input').style.borderColor = '#e53e3e';
        return;
      }
      const selectVal = document.getElementById('edu-toolkit-select')?.value || '';
      const prompt = config.getPrompt(input, selectVal);
      document.getElementById('edu-toolkit-modal')?.remove();
      
      // Inject the prompt into the chat input and send
      injectAndSend(prompt);
    };

    // Enter key
    document.getElementById('edu-toolkit-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('edu-toolkit-submit')?.click();
      }
    });
  }

  // ─── ELI10 Handler ───

  function handleELI10(botText) {
    if (!botText) {
      // If no text given, use the last bot message in the DOM
      const botMessages = document.querySelectorAll('.message.bot .message-content');
      const lastBot = botMessages[botMessages.length - 1];
      if (lastBot) {
        botText = lastBot.textContent || lastBot.innerText;
      }
    }
    if (!botText) return;

    const prompt = `Explain this like I'm 10 years old. Use a simple story or real-life example that a child would understand. Keep it short and fun:\n\n"${botText.substring(0, 1000)}"`;
    injectAndSend(prompt);
  }

  // ─── Chat Injection Helper ───

  function injectAndSend(text) {
    const input = document.getElementById('message-input');
    if (!input) return;
    
    // Set the text
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Trigger send
    setTimeout(() => {
      const sendBtn = document.getElementById('send-btn');
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.click();
      }
    }, 100);
  }

  // ─── Initialize ───

  function init() {
    // 1. Insert sidebar toggle below the History header
    const sidebar = document.querySelector('#sidebar-header');
    if (sidebar) {
      const container = document.createElement('div');
      container.id = 'edu-sidebar-container';
      container.innerHTML = buildSidebarHTML();
      sidebar.parentNode.insertBefore(container, sidebar.nextSibling);

      // Toggle click handler
      document.getElementById('edu-mode-toggle')?.addEventListener('click', () => {
        toggle();
      });

      // Style click handlers
      document.querySelectorAll('.edu-style-item').forEach(item => {
        item.addEventListener('click', () => {
          setStyle(item.dataset.style);
        });
      });
    }

    // 2. Insert tools into left-actions
    const leftActions = document.querySelector('.left-actions');
    if (leftActions) {
      leftActions.insertAdjacentHTML('beforeend', buildToolbarHTML());

      // Toggle popup
      const toggleBtn = document.getElementById('edu-tools-toggle');
      const popup = document.getElementById('edu-tools-popup');
      
      if (toggleBtn && popup) {
        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          popup.classList.toggle('show');
          
          // close composer popup if open
          const composerPopup = document.getElementById('composer-actions-popup');
          if (composerPopup && composerPopup.classList.contains('show')) {
            composerPopup.classList.remove('show');
            document.getElementById('composer-actions-btn')?.classList.remove('active');
          }
          
          const customModelDropdown = document.getElementById('custom-model-dropdown');
          if (customModelDropdown) customModelDropdown.classList.add('hidden');
        });

        // Close on click outside
        document.addEventListener('click', (e) => {
          if (!popup.contains(e.target) && e.target !== toggleBtn) {
            popup.classList.remove('show');
          }
        });
      }

      // Toolbar click handlers
      document.querySelectorAll('.edu-tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if(popup) popup.classList.remove('show');
          const tool = btn.dataset.tool;
          if (tool === 'eli10') {
            handleELI10();
          } else {
            showToolkitModal(tool);
          }
        });
      });
    }

    // 3. Apply initial state
    renderUI();

    console.log('🎓 Education Mode initialized', isActive ? '(ACTIVE)' : '(inactive)');
  }

  // ─── Public API ───
  return {
    init,
    toggle,
    setStyle,
    getSystemPromptInjection,
    handleELI10,
    showToolkitModal,
    isActive: () => isActive,
    getActiveStyle: () => activeStyle,
    TEACHING_STYLES
  };

})();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.EducationMode.init());
} else {
  // DOM already loaded — wait a tick for other scripts
  setTimeout(() => window.EducationMode.init(), 500);
}
