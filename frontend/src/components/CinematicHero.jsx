import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import FrameSequenceBackground from './FrameSequenceBackground';

export default function CinematicHero({
  onStartLearning,
  onExploreUniverse,
  onOpenDetective,
  lang,
  t,
  lowBandwidth
}) {
  const mountRef = useRef(null);
  const containerRef = useRef(null);
  const [currentSceneIdx, setCurrentSceneIdx] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);

  // 8 Canonical Scenes specified in Section 3 of Master Prompt
  const scenes = [
    {
      id: 'scene-01',
      badge: 'SCENE 01 · THE ARRIVAL',
      title: lang === 'te' ? 'మిమ్మల్ని అర్థం చేసుకునే అభ్యాసం.' : 'Learning That Understands You.',
      subtitle:
        lang === 'te'
          ? 'ప్రతి విద్యార్థి విభిన్నంగా నేర్చుకుంటారు. ఉడాన్ ప్రతి అభ్యాస ప్రయాణాన్ని వ్యక్తిగతీకరిస్తుంది.'
          : 'Every student learns differently. UDAAN makes every learning journey personal.',
      cta: lang === 'te' ? 'ఉడాన్ అన్వేషించండి' : 'Explore UDAAN',
      onCta: onStartLearning,
      tag: 'NCERT CLASS 8'
    },
    {
      id: 'scene-02',
      badge: 'SCENE 02 · THE LEARNING GALAXY',
      title: lang === 'te' ? '5 అభ్యాస గ్రహాల విశ్వం' : 'The Learning Galaxy',
      subtitle:
        lang === 'te'
          ? 'భిన్నాలు, పూర్ణాంకాలు, క.సా.గు, అకరణీయ సంఖ్యలు, మరియు బీజగణితం అనే 5 గ్రహాలు.'
          : '5 holographic learning planets: Fractions, Integers, LCM, Rational Numbers, and Algebra connected by glowing orbital pathways.',
      cta: lang === 'te' ? 'విశ్వాన్ని అన్వేషించండి' : 'Enter Learning Galaxy',
      onCta: onExploreUniverse,
      tag: 'HOLOGRAPHIC 3D WORLDS'
    },
    {
      id: 'scene-03',
      badge: 'SCENE 03 · MEET YOUR AI COMPANION',
      title: lang === 'te' ? 'మీ వ్యక్తిగత AI సహచరుడు' : 'Your Personal Learning Companion',
      subtitle:
        lang === 'te'
          ? 'స్వచ్ఛమైన గాజు గోళం మరియు కాంతి వలయాలతో రూపొందించిన స్నేహపూర్వక మార్గదర్శి.'
          : 'A translucent glass sphere with cyan-violet energy rings that guides you step-by-step and helps you learn from mistakes.',
      cta: lang === 'te' ? 'సహచరుడితో మాట్లాడండి' : 'Meet AI Companion',
      onCta: onStartLearning,
      tag: 'REAL-TIME GUIDANCE'
    },
    {
      id: 'scene-04',
      badge: 'SCENE 04 · THE INTERACTIVE MATH LAB',
      title: lang === 'te' ? 'స్పర్శ సంబంధిత మ్యాథ్ ల్యాబ్' : 'The Interactive Math Lab',
      subtitle:
        lang === 'te'
          ? 'భిన్నాల భాగాలు, సంఖ్యా రేఖలు మరియు 3D గణిత నమూనాలతో కంటికి కనిపించేలా నేర్చుకోండి.'
          : 'Touch, partition, and move fraction blocks and directional number lines in an interactive 3D laboratory.',
      cta: lang === 'te' ? 'ల్యాబ్ తెరవండి' : 'Open 3D Math Lab',
      onCta: onExploreUniverse,
      tag: 'TACTILE VISUALIZATIONS'
    },
    {
      id: 'scene-05',
      badge: 'SCENE 05 · LEARNING FROM MISTAKES',
      title:
        lang === 'te'
          ? 'ప్రతి తప్పు నేర్చుకోవడానికి ఒక కొత్త అవకాశం.'
          : 'Every Mistake is a New Opportunity to Learn.',
      subtitle:
        lang === 'te'
          ? 'తప్పును కేవలం తీర్పుగా చూడకుండా, అంతర్లీన భావనా లోపాన్ని గుర్తించి సరిదిద్దుతుంది.'
          : 'A wrong answer is evidence, not proof. UDAAN discovers why you answered differently, tests hypotheses, and scaffolds recovery.',
      cta: lang === 'te' ? 'డిటెక్టివ్ ప్రారంభించు' : 'Launch Learning Detective',
      onCta: onOpenDetective,
      tag: 'SCIENTIFIC DIAGNOSIS'
    },
    {
      id: 'scene-06',
      badge: 'SCENE 06 · YOUR PERSONAL PROGRESS',
      title: lang === 'te' ? 'ప్రతి రోజూ, కొంచెం మెరుగ్గా.' : 'Every Day, a Little Better.',
      subtitle:
        lang === 'te'
          ? 'అభ్యాస పరంపర, సాధించిన మైలురాళ్ళు, భావన స్పటికాలు మరియు రోజువారీ లక్ష్యాలు.'
          : 'Track your genuine mastery crystals, learning streaks, daily goals, and achievements without toxic competitive pressure.',
      cta: lang === 'te' ? 'నా పురోగతిని చూడండి' : 'View My Learning',
      onCta: onStartLearning,
      tag: 'EVIDENCE-BASED MASTERY'
    },
    {
      id: 'scene-07',
      badge: 'SCENE 07 · TEACHERS WITH BETTER INSIGHTS',
      title:
        lang === 'te'
          ? 'ప్రతి అభ్యాసకుడిని అర్థం చేసుకోవడంలో ఉపాధ్యాయులకు సహాయం.'
          : 'Helping Teachers Understand Every Learner.',
      subtitle:
        lang === 'te'
          ? 'తరగతి సమూహ విశ్లేషణలు, పునరావృత తప్పులు మరియు కార్యాచరణ సిఫార్సులు.'
          : 'Cohort mastery gaps, common misconceptions, and 1-click explainable action cards with suggested remedial lesson plans.',
      cta: lang === 'te' ? 'ఉపాధ్యాయ డ్యాష్‌బోర్డ్' : 'Teacher Command Center',
      onCta: onStartLearning,
      tag: 'INSTRUCTOR INTELLIGENCE'
    },
    {
      id: 'scene-08',
      badge: 'SCENE 08 · START YOUR LEARNING JOURNEY',
      title: lang === 'te' ? 'మీ అభ్యాస ప్రయాణాన్ని ప్రారంభించండి' : 'Ready to Take Flight?',
      subtitle:
        lang === 'te'
          ? 'ఉడాన్ తో మీ విద్యా ప్రయాణాన్ని వ్యక్తిగతీకరించుకోండి.'
          : 'Join Aarav and your intelligent AI companion in the NCERT Class 8 Mathematics adaptive universe.',
      cta: lang === 'te' ? 'ఉచితంగా ప్రారంభించండి' : 'Start Learning Now',
      onCta: onStartLearning,
      tag: 'UDAAN v2.0 READY'
    }
  ];

  // 3D Scene Setup & Camera Scroll Animation
  useEffect(() => {
    if (!mountRef.current) return;

    let scene, camera, renderer, animationFrameId;
    const currentMount = mountRef.current;
    let stars, companionGroup, companionOrb, ring1, ring2, planetsGroup;

    try {
      scene = new THREE.Scene();
      const width = currentMount.clientWidth || window.innerWidth;
      const height = currentMount.clientHeight || window.innerHeight;

      camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      camera.position.set(0, 0, 16);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      currentMount.innerHTML = '';
      currentMount.appendChild(renderer.domElement);

      // Cinematic Lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
      scene.add(ambientLight);

      const cyanPoint = new THREE.PointLight(0x00f2fe, 3.5, 35);
      cyanPoint.position.set(5, 5, 8);
      scene.add(cyanPoint);

      const purplePoint = new THREE.PointLight(0x8a4bff, 3.8, 35);
      purplePoint.position.set(-5, -4, 6);
      scene.add(purplePoint);

      // Starfield Particle Dust (Optimized based on lowBandwidth)
      const starCount = lowBandwidth ? 120 : 450;
      const starGeo = new THREE.BufferGeometry();
      const starPositions = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount * 3; i += 3) {
        starPositions[i] = (Math.random() - 0.5) * 50;
        starPositions[i + 1] = (Math.random() - 0.5) * 35;
        starPositions[i + 2] = (Math.random() - 0.5) * 25 - 2;
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
      const starMat = new THREE.PointsMaterial({
        color: 0x38bdf8,
        size: 0.12,
        transparent: true,
        opacity: 0.65
      });
      stars = new THREE.Points(starGeo, starMat);
      scene.add(stars);

      // Central Dais Floor Steps (matching Clip 1 podium)
      const podiumGeo = new THREE.CylinderGeometry(2.6, 3.0, 0.25, 32);
      const podiumMat = new THREE.MeshStandardMaterial({
        color: 0x101116,
        roughness: 0.25,
        metalness: 0.8
      });
      const podium = new THREE.Mesh(podiumGeo, podiumMat);
      podium.position.set(0, -3.8, 0);
      scene.add(podium);

      const podiumRingGeo = new THREE.TorusGeometry(2.9, 0.04, 16, 64);
      const podiumRingMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe });
      const podiumRing = new THREE.Mesh(podiumRingGeo, podiumRingMat);
      podiumRing.position.set(0, -3.7, 0);
      podiumRing.rotation.x = Math.PI / 2;
      scene.add(podiumRing);

      // The 5 Canonical Learning Planets Group
      planetsGroup = new THREE.Group();
      scene.add(planetsGroup);

      const planetsData = [
        { id: 'c1', color: 0x8a4bff, size: 1.1, pos: [-3.8, 2.2, 0] }, // Fractions
        { id: 'c0', color: 0x00f2fe, size: 1.1, pos: [3.8, 2.2, 0] },  // Integers
        { id: 'c5', color: 0x3b82f6, size: 1.4, pos: [0, 0.4, 0] },    // Rational Numbers
        { id: 'c2', color: 0x0ea5e9, size: 1.1, pos: [-3.8, -1.8, 0] }, // LCM
        { id: 'c7', color: 0xd946ef, size: 1.2, pos: [3.8, -1.8, 0], ring: true } // Algebra
      ];

      planetsData.forEach((p) => {
        const pGroup = new THREE.Group();
        pGroup.position.set(...p.pos);

        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(p.size * 0.7, 24, 24),
          new THREE.MeshStandardMaterial({
            color: p.color,
            roughness: 0.2,
            metalness: 0.4,
            emissive: p.color,
            emissiveIntensity: 0.35
          })
        );
        pGroup.add(sphere);

        // Outer glow wireframe
        const glow = new THREE.Mesh(
          new THREE.SphereGeometry(p.size * 0.82, 16, 16),
          new THREE.MeshBasicMaterial({
            color: p.color,
            wireframe: true,
            transparent: true,
            opacity: 0.25
          })
        );
        pGroup.add(glow);

        if (p.ring) {
          const rMesh = new THREE.Mesh(
            new THREE.RingGeometry(p.size * 0.95, p.size * 1.35, 32),
            new THREE.MeshBasicMaterial({ color: 0xf472b6, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
          );
          rMesh.rotation.x = Math.PI / 3;
          pGroup.add(rMesh);
        }

        planetsGroup.add(pGroup);
      });

      // Connecting Orbital Tracks
      const pathMat = new THREE.LineBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.3 });
      const center = new THREE.Vector3(0, 0.4, 0);
      planetsData.forEach((p) => {
        if (p.id !== 'c5') {
          const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...p.pos), center]);
          scene.add(new THREE.Line(lineGeo, pathMat));
        }
      });

      // AI Companion Hologram (Translucent Sphere + Energy Rings)
      companionGroup = new THREE.Group();
      companionGroup.position.set(2.4, 0.4, 2);

      companionOrb = new THREE.Mesh(
        new THREE.SphereGeometry(0.7, 32, 32),
        new THREE.MeshStandardMaterial({
          color: 0x00f2fe,
          roughness: 0.05,
          metalness: 0.2,
          transparent: true,
          opacity: 0.65,
          emissive: 0x00f2fe,
          emissiveIntensity: 0.4
        })
      );
      companionGroup.add(companionOrb);

      // Energy Ring 1
      ring1 = new THREE.Mesh(
        new THREE.TorusGeometry(0.95, 0.03, 16, 64),
        new THREE.MeshBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.85 })
      );
      ring1.rotation.x = Math.PI / 4;
      companionGroup.add(ring1);

      // Energy Ring 2
      ring2 = new THREE.Mesh(
        new THREE.TorusGeometry(1.08, 0.025, 16, 64),
        new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.8 })
      );
      ring2.rotation.y = Math.PI / 3;
      companionGroup.add(ring2);

      scene.add(companionGroup);

      // Animation Loop
      let clock = new THREE.Clock();

      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);
        const elapsedTime = clock.getElapsedTime();

        // Subtle ambient rotations
        if (stars) stars.rotation.y = elapsedTime * 0.015;
        if (ring1) ring1.rotation.z = elapsedTime * 0.8;
        if (ring2) ring2.rotation.x = -elapsedTime * 0.6;
        if (companionGroup) {
          companionGroup.position.y = 0.4 + Math.sin(elapsedTime * 1.5) * 0.15;
        }
        if (planetsGroup) {
          planetsGroup.children.forEach((p, idx) => {
            p.rotation.y = elapsedTime * 0.2 + idx * 0.3;
          });
        }

        renderer.render(scene, camera);
      };

      animate();

      // Store camera and keyframe controller
      window.__udaanCamera = camera;
      window.__udaanCompanion = companionGroup;
      window.__udaanPlanets = planetsGroup;

      const handleResize = () => {
        if (!currentMount) return;
        const w = currentMount.clientWidth;
        const h = currentMount.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        cancelAnimationFrame(animationFrameId);
        renderer.dispose();
      };
    } catch (err) {
      console.warn('Three.js initialization notice:', err);
    }
  }, [lowBandwidth]);

  // Scroll Progress Listener that interpolates Camera & Scene States
  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const totalScrollable = container.scrollHeight - window.innerHeight;
      const currentScroll = -rect.top;
      const progress = Math.max(0, Math.min(1, currentScroll / (totalScrollable || 1)));

      setScrollProgress(progress);

      const sceneIndex = Math.min(7, Math.floor(progress * 8));
      setCurrentSceneIdx(sceneIndex);

      // Camera Waypoints across the 8 Scenes
      const waypoints = [
        { camX: 0, camY: 0, camZ: 16, compScale: 1.0, planetY: 0 },         // Scene 1: Arrival
        { camX: 0, camY: 1.2, camZ: 11, compScale: 0.8, planetY: 0 },        // Scene 2: Galaxy
        { camX: 1.8, camY: 0.4, camZ: 6.5, compScale: 1.4, planetY: 0.3 },   // Scene 3: Companion
        { camX: 0, camY: -1.8, camZ: 8.5, compScale: 0.9, planetY: -0.4 },   // Scene 4: Math Lab
        { camX: -1.8, camY: 0.2, camZ: 7.2, compScale: 1.1, planetY: 0 },    // Scene 5: Mistakes
        { camX: 0, camY: 0.5, camZ: 9.0, compScale: 1.0, planetY: 0.2 },     // Scene 6: Progress
        { camX: 0, camY: 3.2, camZ: 12.5, compScale: 0.8, planetY: -0.2 },   // Scene 7: Teachers
        { camX: 0, camY: 0, camZ: 13.5, compScale: 1.2, planetY: 0 }         // Scene 8: Launch
      ];

      if (window.__udaanCamera) {
        const cam = window.__udaanCamera;
        const currentWp = waypoints[sceneIndex];
        const nextWp = waypoints[Math.min(7, sceneIndex + 1)];
        const localT = (progress * 8) - sceneIndex;

        // Smooth Linear Interpolation
        cam.position.x = THREE.MathUtils.lerp(currentWp.camX, nextWp.camX, localT);
        cam.position.y = THREE.MathUtils.lerp(currentWp.camY, nextWp.camY, localT);
        cam.position.z = THREE.MathUtils.lerp(currentWp.camZ, nextWp.camZ, localT);
        cam.lookAt(0, 0, 0);
      }

      if (window.__udaanCompanion) {
        const comp = window.__udaanCompanion;
        const s = THREE.MathUtils.lerp(
          waypoints[sceneIndex].compScale,
          waypoints[Math.min(7, sceneIndex + 1)].compScale,
          (progress * 8) - sceneIndex
        );
        comp.scale.set(s, s, s);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToScene = (idx) => {
    if (!containerRef.current) return;
    const totalHeight = containerRef.current.scrollHeight - window.innerHeight;
    const targetScroll = (idx / 7) * totalHeight;
    const containerTop = containerRef.current.offsetTop;
    window.scrollTo({
      top: containerTop + targetScroll,
      behavior: 'smooth'
    });
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        minHeight: '720vh',
        background: '#07080a',
        color: '#f8fafc'
      }}
    >
      {/* Pinned 3D WebGL Canvas Viewport (Sticky) */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          left: 0,
          width: '100%',
          height: '100vh',
          zIndex: 1,
          overflow: 'hidden'
        }}
      >
        <FrameSequenceBackground
          basePath="/assets/clip1/ezgif-frame-"
          poster="/assets/clip1/ezgif-frame-001.jpg"
          opacity={0.8}
          animate={!lowBandwidth}
          style={{ zIndex: 0 }}
        />

        <div ref={mountRef} style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }} />

        {/* Ambient Gradient Overlays for Readability & Depth */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at 50% 50%, transparent 40%, rgba(7, 8, 10, 0.75) 85%, #07080a 100%)',
            pointerEvents: 'none',
            zIndex: 2
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(7, 8, 10, 0.4) 0%, transparent 40%, rgba(7, 8, 10, 0.8) 100%)',
            pointerEvents: 'none',
            zIndex: 2
          }}
        />

        {/* Floating Top-Right HUD: Scene Indicator & Camera Telemetry */}
        <div
          style={{
            position: 'absolute',
            top: '20px',
            right: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'rgba(16, 17, 22, 0.85)',
            padding: '8px 16px',
            borderRadius: '99px',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(0, 242, 254, 0.25)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            zIndex: 10
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#00f2fe', boxShadow: '0 0 8px #00f2fe' }}></span>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f8fafc' }}>
            CINEMATIC CAMERA · {scenes[currentSceneIdx].badge}
          </span>
          <span className="tag purple">{Math.round(scrollProgress * 100)}%</span>
        </div>

        {/* Floating Left HUD: 8-Scene Waypoint Navigator */}
        <div
          style={{
            position: 'absolute',
            left: '24px',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            zIndex: 10
          }}
        >
          {scenes.map((s, idx) => {
            const isActive = currentSceneIdx === idx;
            return (
              <button
                key={s.id}
                onClick={() => scrollToScene(idx)}
                title={s.badge}
                style={{
                  width: isActive ? '32px' : '10px',
                  height: '10px',
                  borderRadius: '99px',
                  background: isActive ? 'linear-gradient(90deg, #00f2fe, #38bdf8)' : 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: isActive ? '0 0 12px #00f2fe' : 'none'
                }}
              />
            );
          })}
        </div>

        {/* Bottom Scroll Progress Bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: '100%',
            height: '4px',
            background: 'rgba(255, 255, 255, 0.1)',
            zIndex: 10
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${scrollProgress * 100}%`,
              background: 'linear-gradient(90deg, #00f2fe 0%, #a855f7 100%)',
              boxShadow: '0 0 10px #00f2fe'
            }}
          />
        </div>

        {/* Scroll To Explore Indicator on Scene 0 */}
        {currentSceneIdx === 0 && (
          <div
            style={{
              position: 'absolute',
              bottom: '30px',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              animation: 'bounce 2s infinite',
              zIndex: 10,
              pointerEvents: 'none'
            }}
          >
            <span style={{ fontSize: '0.78rem', color: '#00f2fe', letterSpacing: '1px', fontWeight: 700 }}>
              SCROLL DOWN TO EXPLORE
            </span>
            <span style={{ fontSize: '1.2rem', color: '#00f2fe' }}>↓</span>
          </div>
        )}
      </div>

      {/* Foreground Narrative Scroll Sections (8 Distinct Scenes) */}
      <div style={{ position: 'relative', zIndex: 2, marginTop: '-100vh' }}>
        {scenes.map((scene, idx) => {
          return (
            <section
              key={scene.id}
              style={{
                minHeight: '90vh',
                display: 'flex',
                alignItems: 'center',
                padding: '0 8vw',
                pointerEvents: 'none'
              }}
            >
              <div
                style={{
                  maxWidth: '680px',
                  background: 'rgba(10, 12, 18, 0.82)',
                  border: '1px solid rgba(0, 242, 254, 0.3)',
                  borderRadius: '24px',
                  padding: '36px 40px',
                  backdropFilter: 'blur(20px)',
                  boxShadow: '0 25px 60px rgba(0,0,0,0.85), 0 0 30px rgba(0, 242, 254, 0.12)',
                  pointerEvents: 'auto',
                  transform: currentSceneIdx === idx ? 'translateY(0)' : 'translateY(20px)',
                  opacity: currentSceneIdx === idx ? 1 : 0.65,
                  transition: 'all 0.5s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <span className="badge-tag">{scene.badge}</span>
                  <span className="tag purple">{scene.tag}</span>
                </div>

                <h1
                  style={{
                    fontSize: 'clamp(2.0rem, 4vw, 3.2rem)',
                    fontWeight: 900,
                    lineHeight: 1.15,
                    marginBottom: '16px',
                    letterSpacing: '-0.5px'
                  }}
                >
                  {scene.title}
                </h1>

                <p
                  style={{
                    fontSize: '1.12rem',
                    lineHeight: 1.65,
                    color: '#cbd5e1',
                    marginBottom: '28px'
                  }}
                >
                  {scene.subtitle}
                </p>

                {/* Interactive Scene Action Row */}
                <div className="row" style={{ gap: '14px' }}>
                  <button
                    className="pri"
                    onClick={scene.onCta}
                    style={{ padding: '12px 26px', fontSize: '1rem', borderRadius: '12px' }}
                  >
                    🚀 {scene.cta}
                  </button>

                  <button
                    className="sec"
                    onClick={() => scrollToScene(Math.min(7, idx + 1))}
                    style={{ padding: '12px 20px', fontSize: '0.92rem', borderRadius: '12px' }}
                  >
                    Next Scene ↓
                  </button>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
