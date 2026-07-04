import { useNavigate } from 'react-router-dom'

const GAMES = [
  { id: '1', name: '게임1', desc: '숫자 맞추기' },
  { id: '2', name: '게임2', desc: '로켓 피하기' },
  { id: '3', name: '게임3', desc: '펜싱' },
  { id: '4', name: '게임4', desc: '공룡 달리기' },
  { id: '5', name: '게임5', desc: '몬스터 포격전' },
  { id: '6', name: '게임6', desc: '펌프' },
  { id: '7', name: '게임7', desc: '스피드 오목' },
  { id: '8', name: '게임8', desc: '마그마 총격 듀얼' },
  { id: '9', name: '게임9', desc: '줄다리기' },
  { id: '10', name: '게임10', desc: '라이트 사이클' },
]

export default function MainScreen() {
  const navigate = useNavigate()
  return (
    <div className="main-screen">
      <h1 className="logo">MADPUMP</h1>
      <p className="tagline">1:1 미니게임 대전 · 로컬 2인</p>
      <div className="game-buttons">
        {GAMES.map((g) => (
          <button key={g.id} className="game-button" onClick={() => navigate(`/game/${g.id}`)}>
            <span className="game-button-name">{g.name}</span>
            <span className="game-button-desc">{g.desc}</span>
          </button>
        ))}
      </div>
      <p className="keys-hint">
        <span className="p1-text">Player 1 — Q · W</span>
        <span className="divider">|</span>
        <span className="p2-text">Player 2 — U · I</span>
      </p>
    </div>
  )
}
