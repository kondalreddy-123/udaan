import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export default function LearningGalaxy({ mastery, concepts, onSelectTopic, lang, t }) {
  const mountRef = useRef(null);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [renderMode, setRenderMode] = useState('webgl'); // 'webgl' or 'cinematic'
  const [engineNotice, setEngineNotice] = useState('');

  // Keep the latest click handler without re-creating the Three.js scene.
  const onSelectTopicRef = useRef(onSelectTopic);
  useEffect(() => {
    onSelectTopicRef.current = onSelectTopic;
  }, [onSelectTopic]);

  const handlePick = (topicId) => {
    setSelectedTopic(topicId);
    onSelectTopicRef.current?.(topicId);
  };

  // The 5 Canonical Learning Planets matching Clip 1
  const planetsData = [
    {
      id: 'c1',
      name_en: 'Fractions',
      name_te: 'భిన్నాలు',
      subtitle: 'Equivalent Forms & Slices',
      desc_en: 'Part-whole partitions, equivalent forms, and fraction slices (1/2, 1/4, 3/4).',
      desc_te: 'భిన్నాల భాగాలు, లవం మరియు హారం అర్థం మరియు సమాన భిన్నాలు.',
      color: 0x8a4bff, // purple
      ringColor: 0xc084fc,
      symbol: '2 | 1/4',
      size: 1.5,
      position: [-3.8, 2.2, 0],
      defaultStatus: 'Mastered',
      badgeClass: 'good',
      order: 1
    },
    {
      id: 'c0',
      name_en: 'Integers',
      name_te: 'పూర్ణాంకాలు',
      subtitle: 'Directed Numbers Line',
      desc_en: 'Signed arithmetic, zero pivot, and bidirectional vector jumps (-3 to +3).',
      desc_te: 'సంఖ్యా రేఖపై ధన, రుణ సంఖ్యలు మరియు సున్నా ప్రాథమిక భావనలు.',
      color: 0x00f2fe, // cyan
      ringColor: 0x38bdf8,
      symbol: '← -2 -1 0 1 2 →',
      size: 1.5,
      position: [3.8, 2.2, 0],
      defaultStatus: 'Available',
      badgeClass: 'purple',
      order: 2
    },
    {
      id: 'c5',
      name_en: 'Rational Numbers',
      name_te: 'అకరణీయ సంఖ్యలు',
      subtitle: 'Unlike Denominators & Signs',
      desc_en: 'Multi-step addition involving unlike denominators, negative signs, and LCM.',
      desc_te: 'వేర్వేరు హారాలు మరియు రుణ గుర్తులు గల అకరణీయ సంఖ్యల కూడిక.',
      color: 0x3b82f6, // deep blue / purple core
      ringColor: 0x00e5ff,
      symbol: '-3/4  1/2  0.5',
      size: 2.1,
      position: [0, 0.4, 0],
      defaultStatus: 'In Progress',
      badgeClass: 'good',
      order: 3
    },
    {
      id: 'c2',
      name_en: 'LCM',
      name_te: 'క.సా.గు',
      subtitle: 'Common Multiples & Cubes',
      desc_en: 'Least Common Multiple algorithms to equalize unequal fraction partitions.',
      desc_te: 'వేర్వేరు హారాలను సమానం చేయడానికి క.సా.గు పద్ధతి.',
      color: 0x0ea5e9, // ocean teal
      ringColor: 0x67e8f9,
      symbol: '[12] [16] [24]',
      size: 1.5,
      position: [-3.8, -1.8, 0],
      defaultStatus: 'Locked',
      badgeClass: 'warn',
      order: 4
    },
    {
      id: 'c7',
      name_en: 'Algebra',
      name_te: 'బీజగణితం',
      subtitle: 'Equations & Saturn Rings',
      desc_en: 'Variable expressions, rational algebraic equations, and planetary ring balances.',
      desc_te: 'చరరాశులు, అకరణీయ బీజగణిత సమీకరణాలు మరియు సమాసాలు.',
      color: 0xd946ef, // magenta / saturn violet
      ringColor: 0xf472b6,
      symbol: 'x + 3 = 7',
      size: 1.6,
      hasSaturnRing: true,
      position: [3.8, -1.8, 0],
      defaultStatus: 'Locked',
      badgeClass: 'warn',
      order: 5
    }
  ];

  // Helper to determine planet status dynamically based on actual mastery records
  const getTopicStatus = (p) => {
    const score = mastery[p.id];
    if (score !== undefined) {
      if (score >= 0.75) return { code: 'mastered', label: lang === 'te' ? 'పూర్తయింది ✓' : 'Topic Completed', color: '#10b981', icon: '✓' };
      if (score >= 0.40) return { code: 'progress', label: lang === 'te' ? 'నేర్చుకుంటున్నారు' : 'Learning', color: '#00f2fe', icon: '●' };
      return { code: 'needs_practice', label: lang === 'te' ? 'మరింత సాధన అవసరం' : 'Needs More Practice', color: '#fb923c', icon: '○' };
    }
    return { code: 'not_started', label: lang === 'te' ? 'ప్రారంభించలేదు' : 'Not Started', color: '#a855f7', icon: '○' };
  };

  useEffect(() => {
    if (renderMode !== 'webgl' || !mountRef.current) return undefined;

    const currentMount = mountRef.current;
    const height = 560;
    const meshMap = new Map();
    const clickable = [];
    let scene;
    let camera;
    let renderer;
    let animationFrameId = 0;
    let resizeObserver;
    let disposed = false;
    let hoveredId = null;

    const prefersReducedMotion = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    try {
      scene = new THREE.Scene();
      const width = Math.max(currentMount.clientWidth || 0, 320);

      camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      camera.position.set(0, 0, 14);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.cursor = 'grab';
      renderer.domElement.setAttribute('role', 'img');
      renderer.domElement.setAttribute(
        'aria-label',
        'Interactive 3D learning universe. Click a planet to open its Math Lab.'
      );
      currentMount.appendChild(renderer.domElement);

      // Cinematic Lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
      scene.add(ambientLight);

      const cyanPoint = new THREE.PointLight(0x00f2fe, 3, 30);
      cyanPoint.position.set(4, 5, 8);
      scene.add(cyanPoint);

      const purplePoint = new THREE.PointLight(0x8a4bff, 3.5, 30);
      purplePoint.position.set(-5, -4, 6);
      scene.add(purplePoint);

      // Starfield Particle Dust
      const starGeo = new THREE.BufferGeometry();
      const starCount = 450;
      const starPositions = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount * 3; i += 3) {
        starPositions[i] = (Math.random() - 0.5) * 45;
        starPositions[i + 1] = (Math.random() - 0.5) * 30;
        starPositions[i + 2] = (Math.random() - 0.5) * 20 - 4;
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
      const starMat = new THREE.PointsMaterial({
        color: 0x38bdf8,
        size: 0.12,
        transparent: true,
        opacity: 0.65
      });
      const stars = new THREE.Points(starGeo, starMat);
      scene.add(stars);

      // Connecting Orbital Tracks (Constellation Pentagram)
      const pathMat = new THREE.LineBasicMaterial({
        color: 0x00f2fe,
        transparent: true,
        opacity: 0.35
      });

      const centerPos = new THREE.Vector3(0, 0.4, 0);
      planetsData.forEach((p) => {
        if (p.id !== 'c5') {
          const pPos = new THREE.Vector3(...p.position);
          const points = [pPos, centerPos];
          const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
          const line = new THREE.Line(lineGeo, pathMat);
          scene.add(line);
        }
      });

      // Outer Constellation Rings
      const ringGeo = new THREE.RingGeometry(5.4, 5.44, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x8a4bff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.25
      });
      const outerRing = new THREE.Mesh(ringGeo, ringMat);
      outerRing.position.set(0, 0.4, -0.5);
      scene.add(outerRing);

      // Central Dais Floor Steps (matching Clip 1 podium)
      const podiumGeo = new THREE.CylinderGeometry(2.4, 2.8, 0.3, 32);
      const podiumMat = new THREE.MeshStandardMaterial({
        color: 0x101116,
        roughness: 0.2,
        metalness: 0.85
      });
      const podium = new THREE.Mesh(podiumGeo, podiumMat);
      podium.position.set(0, -3.8, 0);
      scene.add(podium);

      const podiumRingGeo = new THREE.TorusGeometry(2.7, 0.05, 16, 64);
      const podiumRingMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe });
      const podiumRing = new THREE.Mesh(podiumRingGeo, podiumRingMat);
      podiumRing.position.set(0, -3.7, 0);
      podiumRing.rotation.x = Math.PI / 2;
      scene.add(podiumRing);

      // Create Planet Meshes
      planetsData.forEach((p) => {
        const group = new THREE.Group();
        group.position.set(...p.position);

        // Core Sphere
        const sphereGeo = new THREE.SphereGeometry(p.size * 0.7, 32, 32);
        const sphereMat = new THREE.MeshStandardMaterial({
          color: p.color,
          roughness: 0.15,
          metalness: 0.35,
          emissive: p.color,
          emissiveIntensity: 0.3
        });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.userData.topicId = p.id;
        clickable.push(sphere);
        group.add(sphere);

        // Outer Glass Glow Atmosphere
        const atmoGeo = new THREE.SphereGeometry(p.size * 0.82, 24, 24);
        const atmoMat = new THREE.MeshStandardMaterial({
          color: p.ringColor,
          transparent: true,
          opacity: 0.35,
          roughness: 0.1,
          wireframe: true
        });
        const atmo = new THREE.Mesh(atmoGeo, atmoMat);
        group.add(atmo);

        // Saturn Rings for Algebra Planet
        if (p.hasSaturnRing) {
          const saturnRingGeo = new THREE.RingGeometry(p.size * 0.95, p.size * 1.4, 32);
          const saturnRingMat = new THREE.MeshBasicMaterial({
            color: p.ringColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.6
          });
          const saturnRing = new THREE.Mesh(saturnRingGeo, saturnRingMat);
          saturnRing.rotation.x = Math.PI / 3;
          group.add(saturnRing);
        }

        scene.add(group);
        meshMap.set(p.id, { group, sphere, atmo, origY: p.position[1] });
      });

      // Central Floating AI Companion Drone
      const companionGroup = new THREE.Group();
      companionGroup.position.set(0, -2.6, 1.2);

      const compBodyGeo = new THREE.SphereGeometry(0.5, 24, 24);
      const compBodyMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.1,
        metalness: 0.9,
        transparent: true,
        opacity: 0.85
      });
      const compBody = new THREE.Mesh(compBodyGeo, compBodyMat);
      companionGroup.add(compBody);

      const compRingGeo = new THREE.TorusGeometry(0.7, 0.03, 16, 32);
      const compRingMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe });
      const compRing = new THREE.Mesh(compRingGeo, compRingMat);
      compRing.rotation.x = Math.PI / 3;
      companionGroup.add(compRing);

      scene.add(companionGroup);

      // ── Pointer picking: click a planet in 3D to open its lab ──────────
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();

      const updatePointer = (event) => {
        const rect = renderer.domElement.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      };

      const pickTopic = () => {
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(clickable, false);
        return hits.length ? hits[0].object.userData.topicId : null;
      };

      const handlePointerMove = (event) => {
        updatePointer(event);
        const id = pickTopic();
        if (id !== hoveredId) {
          hoveredId = id;
          renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
        }
      };

      const handlePointerLeave = () => {
        hoveredId = null;
        renderer.domElement.style.cursor = 'grab';
      };

      const handleClick = (event) => {
        updatePointer(event);
        const id = pickTopic();
        if (id) onSelectTopicRef.current?.(id);
      };

      renderer.domElement.addEventListener('pointermove', handlePointerMove);
      renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
      renderer.domElement.addEventListener('click', handleClick);

      // ── Animation loop ────────────────────────────────────────────────
      const startTime = performance.now();
      const animate = () => {
        if (disposed) return;
        animationFrameId = requestAnimationFrame(animate);
        const elapsed = (performance.now() - startTime) / 1000;

        meshMap.forEach((item, id) => {
          const hovered = id === hoveredId;
          const targetScale = hovered ? 1.14 : 1;
          item.group.scale.x += (targetScale - item.group.scale.x) * 0.14;
          item.group.scale.y = item.group.scale.x;
          item.group.scale.z = item.group.scale.x;

          item.sphere.rotation.y += hovered ? 0.02 : 0.008;
          item.atmo.rotation.y -= 0.005;
          item.atmo.rotation.x += 0.003;
          item.group.position.y = item.origY + Math.sin(elapsed * 1.5 + id.charCodeAt(1)) * 0.15;
        });

        compRing.rotation.z += 0.02;
        companionGroup.position.y = -2.6 + Math.sin(elapsed * 2.5) * 0.15;

        if (!prefersReducedMotion) {
          camera.position.x = Math.sin(elapsed * 0.2) * 0.4;
          camera.position.y = Math.cos(elapsed * 0.2) * 0.3;
        }
        camera.lookAt(0, 0.2, 0);

        renderer.render(scene, camera);
      };

      animate();

      // ── Responsive sizing (ResizeObserver covers panel/layout changes) ──
      const applySize = () => {
        if (disposed) return;
        const w = Math.max(currentMount.clientWidth || 0, 320);
        camera.aspect = w / height;
        camera.updateProjectionMatrix();
        renderer.setSize(w, height);
      };

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(applySize);
        resizeObserver.observe(currentMount);
      }
      window.addEventListener('resize', applySize);

      // ── Graceful fallback if the GPU context is lost ────────────────────
      const handleContextLost = (event) => {
        event.preventDefault();
        setEngineNotice('3D engine paused — switched to Cinematic Mode.');
        setRenderMode('cinematic');
      };
      renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

      return () => {
        disposed = true;
        cancelAnimationFrame(animationFrameId);
        window.removeEventListener('resize', applySize);
        if (resizeObserver) resizeObserver.disconnect();

        renderer.domElement.removeEventListener('pointermove', handlePointerMove);
        renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
        renderer.domElement.removeEventListener('click', handleClick);
        renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);

        scene.traverse((object) => {
          if (object.geometry) object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : object.material
              ? [object.material]
              : [];
          materials.forEach((material) => {
            Object.keys(material).forEach((key) => {
              const value = material[key];
              if (value && value.isTexture) value.dispose();
            });
            material.dispose();
          });
        });

        renderer.dispose();
        if (renderer.domElement.parentNode === currentMount) {
          currentMount.removeChild(renderer.domElement);
        }
      };
    } catch (err) {
      console.error('Three.js initialization fallback:', err);
      setEngineNotice('3D is unavailable on this device — switched to Cinematic Mode.');
      setRenderMode('cinematic');
      return undefined;
    }
  }, [renderMode]);

  return (
    <div style={{ position: 'relative' }}>
      {/* Top Banner and Controls */}
      <div className="card" style={{ marginBottom: '16px', padding: '20px 26px' }}>
        <div className="row spaced">
          <div>
            <div className="row" style={{ gap: '8px' }}>
              <span className="badge-tag">NCERT MATHEMATICS GALAXY</span>
              <span className="tag good">5 Interactive Planets</span>
            </div>
            <h2 style={{ fontSize: '1.75rem', margin: '8px 0 2px' }}>Interactive Learning Universe</h2>
            <p className="mu" style={{ margin: 0 }}>
              Five holographic learning worlds. Click any planet — or a card below — to open that
              topic in the 3D Math Lab with its own animated visualisers.
            </p>
          </div>

          <div className="row">
            <button
              className={renderMode === 'webgl' ? 'pri' : 'sec'}
              onClick={() => {
                setEngineNotice('');
                setRenderMode('webgl');
              }}
            >
              🪐 3D WebGL Engine
            </button>
            <button
              className={renderMode === 'cinematic' ? 'pri' : 'sec'}
              onClick={() => setRenderMode('cinematic')}
            >
              🎬 Cinematic Mode
            </button>
          </div>
        </div>

        {engineNotice && (
          <div className="ml-engine-notice" role="status">{engineNotice}</div>
        )}
      </div>

      {/* Main 3D Cosmos Stage Container */}
      <div
        style={{
          position: 'relative',
          minHeight: '580px',
          background: 'radial-gradient(ellipse at center, #0f121e 0%, #07080a 100%)',
          borderRadius: '24px',
          border: '1px solid rgba(0, 242, 254, 0.25)',
          overflow: 'hidden',
          boxShadow: '0 25px 60px rgba(0,0,0,0.85), inset 0 0 80px rgba(0,0,0,0.7)'
        }}
      >
        {/* Render Viewport: Three.js or Cinematic Loop */}
        {renderMode === 'webgl' ? (
          <div ref={mountRef} style={{ width: '100%', height: '580px' }} />
        ) : (
          <div style={{ position: 'relative', width: '100%', height: '580px' }}>
            <img
              src="/assets/cinematic/universe_loop.webp"
              alt="Learning Universe Constellation"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(180deg, rgba(7, 8, 10, 0.2) 0%, rgba(7, 8, 10, 0.8) 100%)'
              }}
            />
          </div>
        )}

        {/* Student Character Presence on Bottom Left (Back View, matching Clip 1) */}
        <div
          style={{
            position: 'absolute',
            bottom: '15px',
            left: '25px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'rgba(10, 12, 18, 0.85)',
            padding: '8px 16px',
            borderRadius: '99px',
            border: '1px solid rgba(0, 242, 254, 0.25)',
            backdropFilter: 'blur(12px)',
            zIndex: 10
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: '#00f2fe',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 900,
              color: '#07080a',
              fontSize: '0.82rem'
            }}
          >
            AS
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f8fafc' }}>Aarav Sharma</div>
            <div style={{ fontSize: '0.72rem', color: '#38bdf8' }}>Observing Cosmos</div>
          </div>
        </div>

        {/* HUD Overlay On Right (Exact Match to Clip 1) */}
        <div
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            width: '260px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            zIndex: 10
          }}
        >
          {/* Card 1: Your Learning Path */}
          <div
            style={{
              background: 'rgba(16, 17, 22, 0.82)',
              border: '1px solid rgba(0, 242, 254, 0.28)',
              borderRadius: '16px',
              padding: '14px 18px',
              backdropFilter: 'blur(16px)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)'
            }}
          >
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f8fafc', marginBottom: '10px' }}>
              Your Learning Path
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {planetsData.map((p) => {
                const st = getTopicStatus(p);
                const isSelected = selectedTopic === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePick(p.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      padding: '4px 6px',
                      borderRadius: '6px',
                      border: 'none',
                      width: '100%',
                      background: isSelected ? 'rgba(0, 242, 254, 0.12)' : 'transparent',
                      color: 'inherit',
                      textAlign: 'left'
                    }}
                  >
                    <span style={{ color: isSelected ? '#00f2fe' : '#e2e8f0' }}>{p.name_en}</span>
                    <span style={{ color: st.color, fontWeight: 700 }}>{st.icon}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Card 2: Motivational Quote */}
          <div
            style={{
              background: 'rgba(16, 17, 22, 0.82)',
              border: '1px solid rgba(138, 75, 255, 0.28)',
              borderRadius: '16px',
              padding: '12px 16px',
              backdropFilter: 'blur(16px)',
              fontSize: '0.8rem',
              color: '#cbd5e1',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            <span style={{ fontSize: '1.2rem' }}>✈</span>
            <span>Small steps today, big dreams tomorrow!</span>
          </div>

          {/* Card 3: Journey Pill */}
          <div
            style={{
              background: 'rgba(10, 12, 18, 0.9)',
              border: '1px solid rgba(0, 242, 254, 0.3)',
              borderRadius: '99px',
              padding: '8px 14px',
              fontSize: '0.76rem',
              fontWeight: 700,
              color: '#38bdf8',
              textAlign: 'center'
            }}
          >
            5 Topics · 1 Journey · Your Future
          </div>
        </div>

        {/* Interaction hint */}
        <div className="ml-stage-hint">
          {renderMode === 'webgl'
            ? 'Click a planet to open its 3D lab • drag-free orbit'
            : 'Cinematic mode — use the topic cards below'}
        </div>
      </div>

      {/* Planet Selection Cards Grid for Direct Access */}
      <div className="grid" style={{ marginTop: '20px' }}>
        {planetsData.map((p) => {
          const st = getTopicStatus(p);
          return (
            <div
              key={p.id}
              className="card"
              onClick={() => handlePick(p.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handlePick(p.id);
                }
              }}
              style={{
                cursor: 'pointer',
                borderColor: selectedTopic === p.id
                  ? 'rgba(0, 242, 254, 0.55)'
                  : 'rgba(255, 255, 255, 0.08)'
              }}
            >
              <div className="row spaced" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: '1.4rem' }}>
                  {p.id === 'c1' ? '🟣' : p.id === 'c0' ? '🔵' : p.id === 'c5' ? '🪐' : p.id === 'c2' ? '🔷' : '🟣'}
                </span>
                <span
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: '99px',
                    color: st.color,
                    background: `${st.color}15`,
                    border: `1px solid ${st.color}40`
                  }}
                >
                  {st.label}
                </span>
              </div>
              <h3 style={{ margin: '4px 0 2px' }}>{lang === 'te' ? p.name_te : p.name_en}</h3>
              <div style={{ fontSize: '0.82rem', color: '#00f2fe', fontWeight: 600, marginBottom: 8 }}>
                {p.subtitle}
              </div>
              <p className="mu" style={{ fontSize: '0.86rem', margin: 0 }}>
                {lang === 'te' ? p.desc_te : p.desc_en}
              </p>
              <div className="row spaced" style={{ marginTop: 14 }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--mu)' }}>Symbol: <b>{p.symbol}</b></span>
                <span className="pri ml-open-world">Open Lab →</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
