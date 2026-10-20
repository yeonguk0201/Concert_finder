const descriptions = {
  poster: ['A. 포스터 월', '공연 포스터를 고르듯, 가볍게 발견하는 라이브.'],
  night: ['B. 애프터 다크', '무대 조명과 티켓의 질감으로, 라이브의 기대감을 먼저.'],
  personal: ['C. 마이 라이브', '좋아하는 아티스트와 예매 일정을 한눈에, 나만의 공연 홈.'],
}
const frame = document.querySelector('#concept-frame')
const initial = new URLSearchParams(location.search).get('concept')
function selectConcept(concept) {
  if (!Object.hasOwn(descriptions, concept)) return
  document.querySelectorAll('[data-concept]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.concept === concept)))
  document.querySelector('#direction-title').textContent = descriptions[concept][0]
  document.querySelector('#direction-description').textContent = descriptions[concept][1]
  frame.src = `./preview.html?concept=${concept}`
  frame.title = `${descriptions[concept][0]} UI 시안`
  const url = new URL(location.href)
  url.searchParams.set('concept', concept)
  history.replaceState(null, '', url)
}
document.querySelectorAll('[data-concept]').forEach(button => button.addEventListener('click', () => selectConcept(button.dataset.concept)))
document.querySelectorAll('[data-size]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-size]').forEach(item => item.setAttribute('aria-pressed', String(item === button)))
  document.querySelector('#preview').classList.toggle('mobile', button.dataset.size === 'mobile')
}))
if (initial && Object.hasOwn(descriptions, initial)) selectConcept(initial)
