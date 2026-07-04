import { Navigate, Route, Routes } from 'react-router-dom'
import MainScreen from './ui/MainScreen'
import GameScreen from './ui/GameScreen'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MainScreen />} />
      <Route path="/game/:id" element={<GameScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
