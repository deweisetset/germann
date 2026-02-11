(function(){
  const startBtn = document.getElementById('startBtn');
  const modeSelect = document.getElementById('mode');
  const gameEl = document.getElementById('game');
  const questionEl = document.getElementById('question');
  const choicesEl = document.getElementById('choices');
  const scoreEl = document.getElementById('score');
  const nextBtn = document.getElementById('nextBtn');
  const restartBtn = document.getElementById('restartBtn');
  const resultEl = document.getElementById('result');

  let data = [];
  let order = [];
  let idx = 0;
  let score = 0;
  let mode = 'de-en';

  // load data.json
  async function loadData(){
    try{
      const res = await fetch('data.json');
      data = await res.json();
    }catch(e){
      console.error('Gagal memuat data.json', e);
      data = [];
    }
  }

  function shuffle(a){
    for(let i=a.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]
    }
  }

  function start(){
    if(!data.length) return alert('Data kosakata kosong. Pastikan file data.json ada.');
    mode = modeSelect.value;
    order = data.map((_,i)=>i);
    shuffle(order);
    idx = 0; score = 0;
    scoreEl.textContent = 'Skor: 0';
    resultEl.classList.add('hidden');
    gameEl.classList.remove('hidden');
    startBtn.classList.add('hidden');
    modeSelect.disabled = true;
    nextBtn.classList.add('hidden');
    restartBtn.classList.add('hidden');
    renderQuestion();
  }

  function renderQuestion(){
    const current = data[order[idx]];
    const isDeEn = mode === 'de-en';
    const prompt = isDeEn ? current.de : current.en;
    const answer = isDeEn ? current.en : current.de;
    questionEl.textContent = prompt;

    // build choices (correct + 3 random)
    const choices = [answer];
    const pool = data.map(d=> isDeEn ? d.en : d.de).filter(x=> x !== answer);
    shuffle(pool);
    for(let i=0;i<3 && i<pool.length;i++) choices.push(pool[i]);
    shuffle(choices);

    
    choicesEl.innerHTML = '';
    choices.forEach(c=>{
      const btn = document.createElement('button');
      btn.className = 'choice';
      btn.textContent = c;
      btn.addEventListener('click', ()=> onAnswer(btn, c === answer));
      choicesEl.appendChild(btn);
    });
  }

  function onAnswer(btn, correct){
    // disable all choices
    Array.from(choicesEl.children).forEach(ch=> ch.disabled = true);
    if(correct){
      btn.classList.add('correct');
      score++;
      scoreEl.textContent = 'Skor: ' + score;
    }else{
      btn.classList.add('wrong');
      // highlight correct one
      Array.from(choicesEl.children).forEach(ch=>{
        if(ch.textContent === (mode==='de-en' ? data[order[idx]].en : data[order[idx]].de)) ch.classList.add('correct');
      });
    }
    nextBtn.classList.remove('hidden');
    if(idx >= order.length-1) nextBtn.textContent = 'Selesai'; else nextBtn.textContent = 'Lanjut';
  }

  function next(){
    if(idx >= order.length-1){
      finish();
      return;
    }
    idx++;
    renderQuestion();
    nextBtn.classList.add('hidden');
  }

  function finish(){
    gameEl.classList.add('hidden');
    resultEl.classList.remove('hidden');
    resultEl.innerHTML = `<h3>Permainan selesai</h3><p>Skor Anda: ${score} / ${order.length}</p>`;
    restartBtn.classList.remove('hidden');
    startBtn.classList.remove('hidden');
    startBtn.textContent = 'Main lagi';
    modeSelect.disabled = false;
  }

  // events
  startBtn.addEventListener('click', start);
  nextBtn.addEventListener('click', next);
  restartBtn.addEventListener('click', ()=>{ start(); });

  // init load data
  loadData();
})();
