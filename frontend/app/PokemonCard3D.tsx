import { useRef, useState, useEffect, Suspense } from "react"
import { useFrame, Canvas } from "@react-three/fiber"
import { Environment } from "@react-three/drei"
import * as THREE from "three"

function PokemonCard3DMesh({ cardImage, isHovered }: { cardImage: string | null; isHovered: boolean }) {
  const groupRef = useRef<THREE.Group>(null)
  const [texture, setTexture] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    if (!cardImage) return
    const loader = new THREE.TextureLoader()
    loader.load(cardImage, (t) => {
      t.colorSpace = THREE.SRGBColorSpace
      setTexture(t)
    })
  }, [cardImage])

  useFrame((state) => {
    if (!groupRef.current) return
    const time = state.clock.elapsedTime
    groupRef.current.rotation.y = Math.sin(time * 0.5) * 0.3 + (isHovered ? 0 : Math.PI * 0.05)
  })

  return (
    <group ref={groupRef}>
      <mesh castShadow>
        <boxGeometry args={[3.3, 4.6, 0.08]} />
        <meshStandardMaterial color="#d4af37" metalness={0.95} roughness={0.1} />
      </mesh>
      {texture ? (
        <mesh position={[0, 0, 0.041]}>
          <planeGeometry args={[3.2, 4.5]} />
          <meshPhysicalMaterial map={texture} metalness={0.1} roughness={0.15} clearcoat={0} />
        </mesh>
      ) : (
        <mesh position={[0, 0, 0.041]}>
          <planeGeometry args={[3.2, 4.5]} />
          <meshStandardMaterial color="#1a1a2e" metalness={0.3} roughness={0.4} />
        </mesh>
      )}
    </group>
  )
}

export function CardScene({ cardImage }: { cardImage: string | null }) {
  const [isHovered, setIsHovered] = useState(false)
  return (
    <div className="w-full h-full cursor-grab active:cursor-grabbing" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <Canvas shadows camera={{ position: [0, 0, 6], fov: 50 }} gl={{ antialias: true, alpha: true }} style={{ background: "transparent" }}>
        <spotLight position={[5, 5, 5]} angle={0.9} penumbra={1} intensity={0.3} castShadow color="#fff5e6" />
        <spotLight position={[-5, 3, 5]} angle={0.3} penumbra={1} intensity={0.2} color="#ffd700" />
        <pointLight position={[0, -3, 3]} intensity={0.3} color="#d4af37" />
        <Suspense fallback={null}>
          <PokemonCard3DMesh cardImage={cardImage} isHovered={isHovered} />
          <Environment preset="studio" environmentIntensity={0.7} />
        </Suspense>
      </Canvas>
    </div>
  )
}
