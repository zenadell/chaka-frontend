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
      icon: '😊',
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
      icon: '📏',
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
      icon: '🎯',
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
      icon: '🔥',
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
      icon: '⚔️',
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
          <span class="edu-icon">🎓</span>
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
      <div id="edu-toolbar" class="edu-toolbar ${isActive ? 'visible' : ''}">
        <button class="edu-tool-btn" data-tool="notes">
          <span class="tool-icon">📝</span> Notes
        </button>
        <button class="edu-tool-btn" data-tool="quiz">
          <span class="tool-icon">📊</span> Quiz
        </button>
        <button class="edu-tool-btn" data-tool="flashcards">
          <span class="tool-icon">🃏</span> Flashcards
        </button>
        <button class="edu-tool-btn" data-tool="timetable">
          <span class="tool-icon">📅</span> Timetable
        </button>
        <button class="edu-tool-btn" data-tool="examprep">
          <span class="tool-icon">🎯</span> Exam Prep
        </button>
        <button class="edu-tool-btn" data-tool="eli10">
          <span class="tool-icon">💡</span> ELI10
        </button>
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

    // 2. Insert toolbar above the input wrapper
    const inputWrapper = document.getElementById('input-wrapper');
    if (inputWrapper) {
      inputWrapper.insertAdjacentHTML('beforebegin', buildToolbarHTML());

      // Toolbar click handlers
      document.querySelectorAll('.edu-tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
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
