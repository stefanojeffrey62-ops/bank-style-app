const openBtn = document.getElementById('openBtn');
const startFlow = document.getElementById('startFlow');
const modal = document.getElementById('modal');
const closeBtn = document.getElementById('closeBtn');
const status = document.getElementById('status');

openBtn.addEventListener('click', ()=> showStep(1));
startFlow.addEventListener('click', ()=> showStep(1));
closeBtn.addEventListener('click', ()=> { modal.classList.add('hidden'); status.textContent=''; });

function showStep(n){
  modal.classList.remove('hidden');
  document.querySelectorAll('.step').forEach(s=>s.classList.remove('active'));
  document.getElementById('step'+n).classList.add('active');
  status.textContent='';
}

// STEP1: Login
document.getElementById('loginForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const f = e.target;
  const username = f.username.value.trim();
  const editable = f.editable.value.trim();
  status.textContent="Sending...";

  try{
    const res = await fetch('/login', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ username, editable })
    });
    const data = await res.json();
    if(data.ok){ status.textContent="Success!"; showStep(2); }
    else status.textContent="Error: "+(data.error||"unknown");
  }catch(err){ status.textContent="Network error"; console.error(err); }
});

// STEP2: KYC
document.getElementById('kycForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const f = e.target;
  const fd = new FormData(f);
  status.textContent="Uploading KYC...";

  try{
    const res = await fetch('/kyc',{ method:'POST', body: fd });
    const data = await res.json();
    if(data.ok){
      status.textContent="KYC submitted! Redirecting...";
      if(data.redirect) window.location.href=data.redirect;
    } else status.textContent="Error: "+(data.error||"unknown");
  }catch(err){ status.textContent="Network error"; console.error(err); }
});