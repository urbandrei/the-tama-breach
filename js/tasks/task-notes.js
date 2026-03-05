import { TaskBase } from './task-base.js';
import { PERSONALITIES } from '../tamagotchi/personality.js';

const QUESTION_BANK = [
  {
    question: 'Specimen posture observed:',
    options: ['Upright / alert', 'Hunched / defensive', 'Swaying / relaxed', 'Erratic / twitching'],
  },
  {
    question: 'Vocalization pattern:',
    options: ['Silent', 'Low hum / purring', 'Intermittent clicks', 'Agitated screeching'],
  },
  {
    question: 'Feeding response:',
    options: ['Eager / immediate', 'Cautious / delayed', 'Ignored food entirely'],
  },
  {
    question: 'Glass integrity check:',
    options: ['No visible damage', 'Hairline fractures', 'Moderate cracking', 'Stress marks near edges'],
  },
  {
    question: 'Ambient temperature near containment:',
    options: ['Normal range', 'Slightly elevated', 'Unusually cold'],
  },
  {
    question: 'Response to proximity:',
    options: ['Approached glass', 'Retreated to corner', 'No reaction', 'Charged at observer'],
  },
  {
    question: 'Eye tracking behavior:',
    options: ['Follows movement', 'Stares at fixed point', 'Eyes closed / dormant', 'Rapid darting'],
  },
  {
    question: 'Containment lighting status:',
    options: ['Stable', 'Flickering intermittently', 'Dimmed / brownout', 'Surging'],
  },
];

export class TaskNotes extends TaskBase {
  constructor(game, config) {
    super(game, config);
    this._questions = [];
    this._answers = [];
    this._tamaId = config.tamaId || null;
    this._optionEls = [];
    this._submitBtn = null;
  }

  start() {
    // Pick 3 random questions
    const shuffled = [...QUESTION_BANK].sort(() => Math.random() - 0.5);
    this._questions = shuffled.slice(0, 3);
    this._answers = [null, null, null];
    this._optionEls = [];

    super.start();
  }

  _buildUI(container) {
    const tamaId = this._tamaId || 'unknown';
    const personality = PERSONALITIES[tamaId];
    const specimenName = personality ? personality.name.toUpperCase() : 'UNKNOWN';

    // Title
    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = 'OBSERVATION REPORT';
    container.appendChild(title);

    // Subtitle
    const subtitle = document.createElement('div');
    subtitle.className = 'task-hint';
    subtitle.style.marginBottom = '10px';
    subtitle.style.fontSize = '9px';
    subtitle.textContent = `Specimen: ${specimenName}`;
    container.appendChild(subtitle);

    // Questions (scrollable wrapper for fallback)
    const questionsWrapper = document.createElement('div');
    questionsWrapper.style.cssText = 'flex:1;min-height:0;overflow-y:auto;';
    const questionsDiv = document.createElement('div');
    questionsDiv.style.cssText = 'text-align:left;max-width:400px;margin:0 auto;';

    for (let qi = 0; qi < this._questions.length; qi++) {
      const q = this._questions[qi];

      const qLabel = document.createElement('div');
      qLabel.style.cssText = 'color:#00ff41;margin-bottom:4px;margin-top:10px;font-size:9px;';
      qLabel.textContent = `${qi + 1}. ${q.question}`;
      questionsDiv.appendChild(qLabel);

      this._optionEls[qi] = [];

      for (let oi = 0; oi < q.options.length; oi++) {
        const optRow = document.createElement('div');
        optRow.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 8px;cursor:pointer;color:#88aa88;font-size:8px;';

        const radio = document.createElement('span');
        radio.style.cssText = 'display:inline-block;width:10px;height:10px;border:1px solid #00ff41;border-radius:50%;flex-shrink:0;';
        radio.dataset.qi = qi;
        radio.dataset.oi = oi;

        const label = document.createElement('span');
        label.textContent = q.options[oi];

        optRow.appendChild(radio);
        optRow.appendChild(label);

        optRow.addEventListener('click', () => this._selectAnswer(qi, oi));

        questionsDiv.appendChild(optRow);
        this._optionEls[qi].push({ row: optRow, radio });
      }
    }

    questionsWrapper.appendChild(questionsDiv);
    container.appendChild(questionsWrapper);

    // Submit button
    this._submitBtn = document.createElement('button');
    this._submitBtn.className = 'night-button';
    this._submitBtn.textContent = 'SUBMIT REPORT';
    this._submitBtn.disabled = true;
    this._submitBtn.style.cssText = 'margin-top:10px;opacity:0.4;cursor:not-allowed;';
    this._submitBtn.addEventListener('click', () => {
      if (!this._submitBtn.disabled) {
        this.complete();
      }
    });
    container.appendChild(this._submitBtn);

    // Hint
    const hint = document.createElement('div');
    hint.className = 'task-hint';
    hint.textContent = '[ESC] Cancel';
    container.appendChild(hint);
  }

  _selectAnswer(qIndex, oIndex) {
    this._answers[qIndex] = oIndex;

    // Update radio visuals for this question
    for (let oi = 0; oi < this._optionEls[qIndex].length; oi++) {
      const { row, radio } = this._optionEls[qIndex][oi];
      if (oi === oIndex) {
        radio.style.background = '#00ff41';
        row.style.color = '#00ff41';
      } else {
        radio.style.background = 'transparent';
        row.style.color = '#88aa88';
      }
    }

    // Enable submit when all answered
    const allAnswered = this._answers.every(a => a !== null);
    if (allAnswered && this._submitBtn) {
      this._submitBtn.disabled = false;
      this._submitBtn.style.opacity = '1';
      this._submitBtn.style.cursor = 'pointer';
    }
  }

  _destroyOverlay() {
    this._optionEls = [];
    this._submitBtn = null;
    super._destroyOverlay();
  }
}
