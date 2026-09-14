window.onload = function() {
    // ==============================================================================
    // 1. BASE DE DATOS BIOMECÁNICA
    // ==============================================================================
    const biomateriales = {
        "Hidroxiapatita": { resAxial: 65.0, resCizallamiento: 45.0, gradiente: "Alto (Rígido)", colorBase: 0xeeeeee },
        "Colageno":       { resAxial: 12.0, resCizallamiento: 8.0,  gradiente: "Bajo (Flexible)", colorBase: 0xffb6c1 },
        "Sintetico":      { resAxial: 80.0, resCizallamiento: 60.0, gradiente: "Muy Alto", colorBase: 0x88ccff },
        "LCA Nativo":     { resAxial: 35.0, resCizallamiento: 25.0, gradiente: "Fisiológico", colorBase: 0xff9999 },
        "Arandela":       { resAxial: 85.0, resCizallamiento: 75.0, gradiente: "Gradiente Óptimo", colorBase: 0xff9999 }
    };

    const cargas_rodilla = {
        "Marcha Lenta": 300,
        "Marcha Normal": 600,
        "Trote": 1200,
        "Salto": 1800
    };

    let materialActual = "LCA Nativo";
    let actividadActual = "Marcha Lenta";
    const area_contacto = Math.PI * 7.0 * 8.0; 

    let rodillaRota = false;
    let progresoRotura = 0; 
    let animacionPausada = false;
    let modoRayosX = false;

    // ==============================================================================
    // 2. CONFIGURACIÓN DEL MOTOR 3D Y CÁMARA
    // ==============================================================================
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.Fog(0x0f172a, 40, 120);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(45, 0, 80); 
    
    let targetCameraPos = new THREE.Vector3(45, 0, 80);
    let targetControlsObj = new THREE.Vector3(0, 0, 0);
    let transicionCamara = false; // <-- NUEVO: Controla si la cámara viaja en automático

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; 
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);

    // <-- NUEVO: Si el usuario usa el ratón, detenemos la transición automática
    controls.addEventListener('start', () => { 
        transicionCamara = false; 
    });

    const lightAmbient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(lightAmbient);
    const lightDir = new THREE.DirectionalLight(0xffffff, 0.8);
    lightDir.position.set(20, 50, 20);
    scene.add(lightDir);

    const geoFemur = new THREE.CylinderGeometry(3.5, 5, 25, 32);
    const geoCondilo = new THREE.SphereGeometry(5.5, 32, 32);
    const geoTibia = new THREE.CylinderGeometry(4.5, 3, 25, 32);
    const geoMeseta = new THREE.CylinderGeometry(5.2, 4.5, 2.5, 32);
    const geoHaz = new THREE.CylinderGeometry(0.8, 0.8, 1, 16, 8); 
    geoHaz.translate(0, 0.5, 0);

    // ==============================================================================
    // 3. MORFOLOGÍA ÓSEA AVANZADA Y LIGAMENTOS (RODILLA DINÁMICA - CENTRO)
    // ==============================================================================
    const matHueso = new THREE.MeshPhongMaterial({ color: 0xe3dac9, shininess: 10, depthWrite: true, transparent: true, opacity: 1.0 });
    
    const femurGroup = new THREE.Group();
    const femur = new THREE.Mesh(geoFemur, matHueso);
    femur.position.y = 12.5;
    femurGroup.add(femur);
    
    const condiloMedial = new THREE.Mesh(geoCondilo, matHueso);
    condiloMedial.position.set(2.5, -0.5, 1);
    condiloMedial.scale.set(1, 1.3, 1.4);
    const condiloLateral = new THREE.Mesh(geoCondilo, matHueso);
    condiloLateral.position.set(-2.5, -0.5, 1);
    condiloLateral.scale.set(1, 1.3, 1.4);
    femurGroup.add(condiloMedial);
    femurGroup.add(condiloLateral);
    scene.add(femurGroup);

    const anclajeFemur = new THREE.Object3D();
    anclajeFemur.position.set(1.0, -0.5, -1.0); 
    femurGroup.add(anclajeFemur);

    const tibiaGroup = new THREE.Group();
    const tibia = new THREE.Mesh(geoTibia, matHueso);
    tibia.position.y = -12.5;
    tibiaGroup.add(tibia);
    
    const meseta = new THREE.Mesh(geoMeseta, matHueso);
    meseta.position.y = 0;
    meseta.position.z = -1.5; 
    meseta.scale.set(1.2, 1, 0.9);
    tibiaGroup.add(meseta);
    scene.add(tibiaGroup);

    const anclajeTibia = new THREE.Object3D();
    anclajeTibia.position.set(0, 1.5, 1.5);
    tibiaGroup.add(anclajeTibia);

    const matLCA = new THREE.MeshPhongMaterial({ color: 0xff9999, shininess: 5, side: THREE.DoubleSide });
    
    const hazAM = new THREE.Mesh(geoHaz, matLCA);
    const hazPL = new THREE.Mesh(geoHaz, matLCA);
    scene.add(hazAM); scene.add(hazPL);

    const hazAM_femur = new THREE.Mesh(geoHaz, matLCA);
    const hazAM_tibia = new THREE.Mesh(geoHaz, matLCA);
    const hazPL_femur = new THREE.Mesh(geoHaz, matLCA);
    const hazPL_tibia = new THREE.Mesh(geoHaz, matLCA);
    scene.add(hazAM_femur); scene.add(hazAM_tibia);
    scene.add(hazPL_femur); scene.add(hazPL_tibia);

    // ==============================================================================
    // 3.1 🌟 PROPUESTA: ARANDELAS BIOMIMÉTICAS Y ONDAS DE DISIPACIÓN
    // ==============================================================================
    const matArandela = new THREE.MeshPhongMaterial({ color: 0x06b6d4, shininess: 80 });
    const geoArandela = new THREE.TorusGeometry(1.6, 0.45, 16, 32);
    
    const matOnda = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0, side: THREE.DoubleSide });
    const geoOnda = new THREE.TorusGeometry(1.6, 0.15, 8, 32);

    const arandelaFemur = new THREE.Mesh(geoArandela, matArandela);
    const ondaFemur = new THREE.Mesh(geoOnda, matOnda);
    arandelaFemur.rotation.x = Math.PI / 2; 
    ondaFemur.rotation.x = Math.PI / 2;
    anclajeFemur.add(arandelaFemur); 
    anclajeFemur.add(ondaFemur);

    const arandelaTibia = new THREE.Mesh(geoArandela, matArandela);
    const ondaTibia = new THREE.Mesh(geoOnda, matOnda);
    arandelaTibia.rotation.x = Math.PI / 2;
    ondaTibia.rotation.x = Math.PI / 2;
    anclajeTibia.add(arandelaTibia);
    anclajeTibia.add(ondaTibia);
    
    const anclajeTibiaPL = new THREE.Vector3(1.2, 0, -0.8);
    const anclajeFemurPL = new THREE.Vector3(-1.0, 0, 1.0);
    
    const arandelaFemurPL = new THREE.Mesh(geoArandela, matArandela);
    const ondaFemurPL = new THREE.Mesh(geoOnda, matOnda);
    arandelaFemurPL.rotation.x = Math.PI / 2;
    ondaFemurPL.rotation.x = Math.PI / 2;
    arandelaFemurPL.position.copy(anclajeFemurPL);
    ondaFemurPL.position.copy(anclajeFemurPL);
    anclajeFemur.add(arandelaFemurPL);
    anclajeFemur.add(ondaFemurPL);

    const arandelaTibiaPL = new THREE.Mesh(geoArandela, matArandela);
    const ondaTibiaPL = new THREE.Mesh(geoOnda, matOnda);
    arandelaTibiaPL.rotation.x = Math.PI / 2;
    ondaTibiaPL.rotation.x = Math.PI / 2;
    arandelaTibiaPL.position.copy(anclajeTibiaPL);
    ondaTibiaPL.position.copy(anclajeTibiaPL);
    anclajeTibia.add(arandelaTibiaPL);
    anclajeTibia.add(ondaTibiaPL);

    // ==============================================================================
    // 3.2 🔬 MODELO DEL ANDAMIO (SCAFFOLD) AL LADO IZQUIERDO
    // ==============================================================================
    const andamioGroup = new THREE.Group();
    andamioGroup.position.set(-20, 0, 0); 
    
    const matAndamioMalla = new THREE.MeshStandardMaterial({ color: 0x06b6d4, wireframe: true, transparent: true, opacity: 0.8 });
    const geoAndamio = new THREE.CylinderGeometry(3, 3, 10, 16, 8);
    const andamioMalla = new THREE.Mesh(geoAndamio, matAndamioMalla);
    
    const matAndamioNucleo = new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
    const andamioNucleo = new THREE.Mesh(geoAndamio, matAndamioNucleo);
    andamioNucleo.scale.set(0.95, 1, 0.95);

    andamioGroup.add(andamioMalla);
    andamioGroup.add(andamioNucleo);
    scene.add(andamioGroup);

    // ==============================================================================
    // 3.3 📍 MODELO ESTÁTICO (INTEGRACIÓN ANDAMIO-LIGAMENTO) AL LADO DERECHO
    // ==============================================================================
    const rodillaEstaticaGroup = new THREE.Group();
    rodillaEstaticaGroup.position.set(25, 0, 0); 
    scene.add(rodillaEstaticaGroup);

    const matHuesoTransparente = new THREE.MeshPhongMaterial({ 
        color: 0x004466, shininess: 10, depthWrite: false, transparent: true, opacity: 0.3 
    });

    const femurEstGroup = new THREE.Group();
    const femurEst = new THREE.Mesh(geoFemur, matHuesoTransparente);
    femurEst.position.y = 12.5;
    femurEstGroup.add(femurEst);
    
    const condMedEst = new THREE.Mesh(geoCondilo, matHuesoTransparente);
    condMedEst.position.set(2.5, -0.5, 1);
    condMedEst.scale.set(1, 1.3, 1.4);
    const condLatEst = new THREE.Mesh(geoCondilo, matHuesoTransparente);
    condLatEst.position.set(-2.5, -0.5, 1);
    condLatEst.scale.set(1, 1.3, 1.4);
    femurEstGroup.add(condMedEst);
    femurEstGroup.add(condLatEst);
    rodillaEstaticaGroup.add(femurEstGroup);

    const tibiaEstGroup = new THREE.Group();
    const tibiaEst = new THREE.Mesh(geoTibia, matHuesoTransparente);
    tibiaEst.position.y = -12.5;
    tibiaEstGroup.add(tibiaEst);
    
    const mesetaEst = new THREE.Mesh(geoMeseta, matHuesoTransparente);
    mesetaEst.position.y = 0;
    mesetaEst.position.z = -1.5; 
    mesetaEst.scale.set(1.2, 1, 0.9);
    tibiaEstGroup.add(mesetaEst);
    
    tibiaEstGroup.rotation.x = Math.PI / 8; 
    tibiaEstGroup.position.y = -1.5;
    tibiaEstGroup.position.z = 2.0;
    rodillaEstaticaGroup.add(tibiaEstGroup);

    const matTunel = new THREE.MeshBasicMaterial({ color: 0x001122, transparent: true, opacity: 0.6, side: THREE.BackSide });
    const geoTunel = new THREE.CylinderGeometry(1.4, 1.4, 7, 16);
    
    const tunelFemur = new THREE.Mesh(geoTunel, matTunel);
    tunelFemur.position.set(1.0, 3.5, -1.0);
    tunelFemur.rotation.x = Math.PI / 6;
    femurEstGroup.add(tunelFemur);

    const tunelTibia = new THREE.Mesh(geoTunel, matTunel);
    tunelTibia.position.set(0, -3.5, 1.5);
    tunelTibia.rotation.x = Math.PI / 8;
    tibiaEstGroup.add(tunelTibia);

    const andamioFemurIntra = new THREE.Mesh(geoAndamio, matAndamioMalla);
    andamioFemurIntra.scale.set(0.42, 0.7, 0.42); 
    andamioFemurIntra.position.set(1.0, 3.5, -1.0); 
    andamioFemurIntra.rotation.x = Math.PI / 6;
    femurEstGroup.add(andamioFemurIntra);

    const andamioTibiaIntra = new THREE.Mesh(geoAndamio, matAndamioMalla);
    andamioTibiaIntra.scale.set(0.42, 0.7, 0.42); 
    andamioTibiaIntra.position.set(0, -3.5, 1.5); 
    andamioTibiaIntra.rotation.x = Math.PI / 8;
    tibiaEstGroup.add(andamioTibiaIntra);

    const matLCA_estatico = new THREE.MeshPhongMaterial({ color: 0xff9999, shininess: 5, transparent: true, opacity: 0.85 });
    const lcaEstatico = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 7.5, 16), matLCA_estatico);
    lcaEstatico.position.set(0.6, -0.2, 0.1); 
    lcaEstatico.rotation.x = Math.PI / 10;
    rodillaEstaticaGroup.add(lcaEstatico);

    const matSutura = new THREE.MeshBasicMaterial({ color: 0x00ffcc, wireframe: true });
    const geoSutura = new THREE.CylinderGeometry(1.0, 1.0, 1.5, 12, 4);
    
    const unionFemoral = new THREE.Mesh(geoSutura, matSutura);
    unionFemoral.position.set(0.8, 2.5, -0.6);
    unionFemoral.rotation.x = Math.PI / 8;
    rodillaEstaticaGroup.add(unionFemoral);

    const unionTibial = new THREE.Mesh(geoSutura, matSutura);
    unionTibial.position.set(0.3, -2.5, 1.0);
    unionTibial.rotation.x = Math.PI / 8;
    rodillaEstaticaGroup.add(unionTibial);

    const matTornillo = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.2 });
    const geoTornillo = new THREE.ConeGeometry(0.5, 2.0, 10, 4, false, 0, Math.PI * 2);

    const tornilloFemur = new THREE.Mesh(geoTornillo, matTornillo);
    tornilloFemur.position.set(1.7, 4.5, -1.8);
    tornilloFemur.rotation.x = Math.PI / 6;
    tornilloFemur.rotation.z = Math.PI / 10; 
    femurEstGroup.add(tornilloFemur);

    const tornilloTibia = new THREE.Mesh(geoTornillo, matTornillo);
    tornilloTibia.position.set(-0.8, -4.5, 2.2);
    tornilloTibia.rotation.x = Math.PI / 8;
    tornilloTibia.rotation.z = -Math.PI / 10; 
    tibiaEstGroup.add(tornilloTibia);

    // ==============================================================================
    // 4. LÓGICA BIOMECÁNICA Y UI
    // ==============================================================================
    const ui = {
        caja: document.getElementById("caja-alerta"),
        fs: document.getElementById("fs-alerta"),
        estado: document.getElementById("estado-alerta"),
        exp: document.getElementById("explicacion-alerta"),
        axial: document.getElementById("val-axial"),
        ciz: document.getElementById("val-cizallamiento"),
        grad: document.getElementById("val-gradiente"),
        btnRayos: document.getElementById("btn-rayosx"),
        btnPausa: document.getElementById("btn-pausa"),
        btnZoomAndamio: document.getElementById("btn-zoom-andamio"),
        btnZoomDinamica: document.getElementById("btn-zoom-dinamica"),
        btnZoomEstatica: document.getElementById("btn-zoom-estatica"),
        btnZoomReset: document.getElementById("btn-zoom-reset")
    };

    // <-- NUEVO: Activamos la transición suave al presionar los botones
    ui.btnZoomAndamio.addEventListener("click", () => {
        targetCameraPos.set(-20, 0, 25); targetControlsObj.set(-20, 0, 0);
        transicionCamara = true; 
    });
    ui.btnZoomDinamica.addEventListener("click", () => {
        targetCameraPos.set(0, 0, 40); targetControlsObj.set(0, 0, 0);
        transicionCamara = true;
    });
    ui.btnZoomEstatica.addEventListener("click", () => {
        targetCameraPos.set(25, 0, 40); targetControlsObj.set(25, 0, 0);
        transicionCamara = true;
    });
    ui.btnZoomReset.addEventListener("click", () => {
        targetCameraPos.set(45, 0, 80); targetControlsObj.set(0, 0, 0);
        transicionCamara = true;
    });

    function alternarRayosX(estadoForzado = null) {
        if(estadoForzado !== null) modoRayosX = estadoForzado;
        else modoRayosX = !modoRayosX;
        
        if(modoRayosX) {
            matHueso.color.setHex(0x004466);
            matHueso.opacity = 0.3; matHueso.depthWrite = false;
            ui.btnRayos.innerText = "Modo Rayos X: ON"; ui.btnRayos.classList.add('activo');
        } else {
            matHueso.color.setHex(0xe3dac9);
            matHueso.opacity = 1.0; matHueso.depthWrite = true;
            ui.btnRayos.innerText = "Modo Rayos X: OFF"; ui.btnRayos.classList.remove('activo');
        }
    }

    function actualizarDiagnostico() {
        const props = biomateriales[materialActual];
        const fuerza = cargas_rodilla[actividadActual];
        
        ui.grad.innerText = props.gradiente;
        
        let factorFriccion = 1.2;
        if (props.gradiente === "Bajo (Flexible)") factorFriccion = 2.5;
        if (materialActual === "Arandela") factorFriccion = 0.4; 
        
        const esf_axial = (fuerza / area_contacto) * 1.5; 
        const tension_ciz = (fuerza / area_contacto) * factorFriccion; 
        
        ui.axial.innerText = esf_axial.toFixed(2) + " MPa";
        ui.ciz.innerText = tension_ciz.toFixed(2) + " MPa";

        const fs_axial = props.resAxial / esf_axial;
        const fs_ciz = props.resCizallamiento / tension_ciz;
        const fs_critico = Math.min(fs_axial, fs_ciz);

        ui.fs.innerText = `Factor de Seguridad: ${fs_critico.toFixed(2)}`;

        const mostrarArandelas = (materialActual === "Arandela");
        arandelaFemur.visible = mostrarArandelas;
        arandelaTibia.visible = mostrarArandelas;
        arandelaFemurPL.visible = mostrarArandelas;
        arandelaTibiaPL.visible = mostrarArandelas;
        
        ondaFemur.visible = mostrarArandelas;
        ondaTibia.visible = mostrarArandelas;
        ondaFemurPL.visible = mostrarArandelas;
        ondaTibiaPL.visible = mostrarArandelas;

        if(materialActual === "Arandela") {
            matAndamioMalla.color.setHex(0x06b6d4); 
            matLCA_estatico.color.setHex(0xff9999);
        } else {
            matAndamioMalla.color.setHex(props.colorBase);
            matLCA_estatico.color.setHex(props.colorBase);
        }

        let colorCaja, colorTexto, estado, explicacion;
        
        if (fs_critico < 1.0) {
            if(!rodillaRota) {
                rodillaRota = true; progresoRotura = 0; animacionPausada = true;
                ui.btnPausa.innerText = "Reanudar Marcha";
            }
            estado = "🚨 FALLA CATASTRÓFICA";
            explicacion = `Ruptura intrasustancial del injerto por ${(fs_ciz < fs_axial) ? "Corte/Cizallamiento" : "Tracción axial"}.`;
            colorCaja = "rgba(239, 68, 68, 0.2)"; colorTexto = "#ef4444";
            matLCA.color.setHex(0xff0000); matLCA_estatico.color.setHex(0xff0000);
        } else if (fs_critico < 1.5) {
            rodillaRota = false; progresoRotura = 0;
            estado = "⚠️ PRECAUCIÓN: MICROFISURAS";
            explicacion = `El injerto resiste, pero el alto cizallamiento causará desgaste en la interfaz.`;
            colorCaja = "rgba(245, 158, 11, 0.2)"; colorTexto = "#f59e0b";
            matLCA.color.setHex(0xffaa00); matLCA_estatico.color.setHex(0xffaa00);
            if(!modoRayosX) alternarRayosX(true);
        } else {
            rodillaRota = false; progresoRotura = 0;
            estado = "🛡️ ESTABLE Y SEGURO";
            if (materialActual === "Arandela") {
                explicacion = `La arandela SF+HA disipa eficientemente las fuerzas cortantes en la embocadura ósea.`;
                colorCaja = "rgba(6, 182, 212, 0.2)"; colorTexto = "#06b6d4"; 
            } else {
                explicacion = `El gradiente de rigidez absorbe las fuerzas cortantes correctamente.`;
                colorCaja = "rgba(16, 185, 129, 0.2)"; colorTexto = "#10b981";
            }
            matLCA.color.setHex(props.colorBase); 
            if(modoRayosX && materialActual !== "Arandela") alternarRayosX(false);
            if(materialActual === "Arandela" && !modoRayosX) alternarRayosX(true); 
        }

        ui.caja.style.backgroundColor = colorCaja; ui.caja.style.borderColor = colorTexto;
        ui.estado.style.color = colorTexto; ui.fs.style.color = colorTexto;
        ui.estado.innerText = estado; ui.exp.innerText = explicacion;
    }

    document.getElementById("material").addEventListener("change", (e) => { materialActual = e.target.value; actualizarDiagnostico(); });
    document.getElementById("actividad").addEventListener("change", (e) => { actividadActual = e.target.value; actualizarDiagnostico(); });
    
    ui.btnPausa.addEventListener("click", (e) => {
        animacionPausada = !animacionPausada;
        e.target.innerText = animacionPausada ? "Reanudar Marcha" : "Pausar Marcha";
    });
    ui.btnRayos.addEventListener("click", () => alternarRayosX(null));

    actualizarDiagnostico();

    // ==============================================================================
    // 5. ANIMACIÓN GENERAL Y RENDERIZADO (ETIQUETAS ACTUALIZADAS)
    // ==============================================================================
    const lblFemur = document.getElementById('label-femur');
    const lblLCA = document.getElementById('label-lca');
    const lblTibia = document.getElementById('label-tibia');
    const lblAndamio = document.getElementById('label-andamio'); 
    const lblEstatica = document.getElementById('label-estatica');
    const lblIntratunel = document.getElementById('label-intratunel'); 
    
    let tiempo = 0;
    const LONGITUD_REPOSO = 14.0; 
    const EJE_Y = new THREE.Vector3(0, 1, 0); 

    function actualizarEtiqueta(elementoHTML, objeto3D) {
        if(!elementoHTML) return;
        if(rodillaRota && (elementoHTML === lblFemur || elementoHTML === lblTibia || elementoHTML === lblLCA)) { 
            elementoHTML.style.opacity = 0; return; 
        }
        
        const vector = new THREE.Vector3();
        objeto3D.getWorldPosition(vector);
        vector.project(camera);
        
        if (vector.z > 1) { elementoHTML.style.opacity = 0; return; }

        const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
        const y = (vector.y * -0.5 + 0.5) * window.innerHeight;
        
        elementoHTML.style.left = `${x}px`;
        elementoHTML.style.top = `${y}px`;
        elementoHTML.style.opacity = 1;
    }

    function animar() {
        requestAnimationFrame(animar);
        
        // <-- NUEVO: Solo movemos la cámara automáticamente si transicionCamara es true
        if (transicionCamara) {
            camera.position.lerp(targetCameraPos, 0.05);
            controls.target.lerp(targetControlsObj, 0.05);
            
            // Si la cámara ya está muy cerca de su destino, detenemos la transición
            if (camera.position.distanceTo(targetCameraPos) < 0.5) {
                transicionCamara = false;
            }
        }
        
        controls.update(); // Siempre actualizamos los controles para mantener la inercia (damping)
        
        andamioGroup.rotation.y += 0.01;
        andamioGroup.rotation.x += 0.005;
        const escalaY = 1.0 + Math.sin(tiempo * 4) * 0.05; 
        andamioGroup.scale.set(1, escalaY, 1);
        
        rodillaEstaticaGroup.rotation.y += 0.002; 
        
        let flex = 0;
        if(!animacionPausada) {
            tiempo += 0.008; 
            flex = Math.abs(Math.sin(tiempo)) * (Math.PI / 4.0); 
            tibiaGroup.rotation.x = flex; 
            tibiaGroup.rotation.y = flex * 0.15; 
            tibiaGroup.position.y = -12.5 - Math.cos(flex) * 1.5; 
            tibiaGroup.position.z = Math.sin(flex) * 5.0; 
            
            if (materialActual === "Arandela") {
                const pulso = (tiempo * 3) % 1.0; 
                const escalaOnda = 1.0 + pulso * 1.5; 
                const opacidadOnda = 1.0 - pulso; 
                
                ondaFemur.scale.set(escalaOnda, escalaOnda, 1);
                ondaTibia.scale.set(escalaOnda, escalaOnda, 1);
                ondaFemurPL.scale.set(escalaOnda, escalaOnda, 1);
                ondaTibiaPL.scale.set(escalaOnda, escalaOnda, 1);
                
                matOnda.opacity = opacidadOnda * 0.6;
            }
            
        } else {
            flex = tibiaGroup.rotation.x;
            matOnda.opacity = 0; 
        }

        const pF = new THREE.Vector3(); anclajeFemur.getWorldPosition(pF);
        const pT = new THREE.Vector3(); anclajeTibia.getWorldPosition(pT);

        const anclajeTibiaPL_local = new THREE.Vector3(1.2, 0, -0.8);
        anclajeTibiaPL_local.applyEuler(tibiaGroup.rotation); 
        const pT_PL = pT.clone().add(anclajeTibiaPL_local);
        const pF_PL = pF.clone().add(new THREE.Vector3(-1.0, 0, 1.0));

        if (!rodillaRota) {
            hazAM.visible = true; hazPL.visible = true;
            hazAM_femur.visible = false; hazAM_tibia.visible = false;
            hazPL_femur.visible = false; hazPL_tibia.visible = false;
            
            const distAM = pF.distanceTo(pT);
            const tensionAM = Math.max(1.0, distAM / LONGITUD_REPOSO); 
            const dirAM = new THREE.Vector3().subVectors(pF, pT).normalize();
            hazAM.position.copy(pT);
            hazAM.quaternion.setFromUnitVectors(EJE_Y, dirAM); 
            hazAM.rotateY(flex * 0.8); 
            hazAM.scale.set(1.5 / tensionAM, distAM, 0.4 / tensionAM); 
            
            const distPL = pF_PL.distanceTo(pT_PL);
            const tensionPL = Math.max(1.0, distPL / LONGITUD_REPOSO);
            const dirPL = new THREE.Vector3().subVectors(pF_PL, pT_PL).normalize();
            hazPL.position.copy(pT_PL);
            hazPL.quaternion.setFromUnitVectors(EJE_Y, dirPL);
            hazPL.rotateY(-flex * 0.9); 
            hazPL.scale.set(1.2 / tensionPL, distPL, 0.3 / tensionPL);
            
            if (materialActual === "Arandela") {
                arandelaFemur.quaternion.setFromUnitVectors(EJE_Y, dirAM);
                arandelaTibia.quaternion.setFromUnitVectors(EJE_Y, dirAM);
                arandelaFemurPL.quaternion.setFromUnitVectors(EJE_Y, dirPL);
                arandelaTibiaPL.quaternion.setFromUnitVectors(EJE_Y, dirPL);
                
                ondaFemur.quaternion.setFromUnitVectors(EJE_Y, dirAM);
                ondaTibia.quaternion.setFromUnitVectors(EJE_Y, dirAM);
                ondaFemurPL.quaternion.setFromUnitVectors(EJE_Y, dirPL);
                ondaTibiaPL.quaternion.setFromUnitVectors(EJE_Y, dirPL);
            }
            
            actualizarEtiqueta(lblFemur, anclajeFemur);
            actualizarEtiqueta(lblTibia, anclajeTibia);
            const dummyMid = new THREE.Object3D();
            dummyMid.position.copy(new THREE.Vector3().addVectors(pF, pT).multiplyScalar(0.5));
            actualizarEtiqueta(lblLCA, dummyMid);

        } else {
            hazAM.visible = false; hazPL.visible = false;
            hazAM_femur.visible = true; hazAM_tibia.visible = true;
            hazPL_femur.visible = true; hazPL_tibia.visible = true;

            if (progresoRotura < 1.0) progresoRotura += 0.04;

            const centroAM = new THREE.Vector3().addVectors(pF, pT).multiplyScalar(0.5);
            const centroPL = new THREE.Vector3().addVectors(pF_PL, pT_PL).multiplyScalar(0.5);

            const extremoAM_tibia = centroAM.clone().lerp(pT, progresoRotura * 0.7);
            extremoAM_tibia.y -= progresoRotura * 2.5; 
            const distAM_t = pT.distanceTo(extremoAM_tibia);
            hazAM_tibia.position.copy(pT);
            if (distAM_t > 0.001) hazAM_tibia.quaternion.setFromUnitVectors(EJE_Y, new THREE.Vector3().subVectors(extremoAM_tibia, pT).normalize());
            hazAM_tibia.scale.set(1.8, distAM_t, 0.6);

            const extremoAM_femur = centroAM.clone().lerp(pF, progresoRotura * 0.3);
            extremoAM_femur.y -= progresoRotura * 4.0;
            const distAM_f = pF.distanceTo(extremoAM_femur);
            hazAM_femur.position.copy(pF);
            if (distAM_f > 0.001) hazAM_femur.quaternion.setFromUnitVectors(EJE_Y, new THREE.Vector3().subVectors(extremoAM_femur, pF).normalize());
            hazAM_femur.scale.set(1.8, distAM_f, 0.6);

            const extremoPL_tibia = centroPL.clone().lerp(pT_PL, progresoRotura * 0.7);
            extremoPL_tibia.y -= progresoRotura * 2.5;
            const distPL_t = pT_PL.distanceTo(extremoPL_tibia);
            hazPL_tibia.position.copy(pT_PL);
            if (distPL_t > 0.001) hazPL_tibia.quaternion.setFromUnitVectors(EJE_Y, new THREE.Vector3().subVectors(extremoPL_tibia, pT_PL).normalize());
            hazPL_tibia.scale.set(1.5, distPL_t, 0.5);

            const extremoPL_femur = centroPL.clone().lerp(pF_PL, progresoRotura * 0.3);
            extremoPL_femur.y -= progresoRotura * 4.0;
            const distPL_f = pF_PL.distanceTo(extremoPL_femur);
            hazPL_femur.position.copy(pF_PL);
            if (distPL_f > 0.001) hazPL_femur.quaternion.setFromUnitVectors(EJE_Y, new THREE.Vector3().subVectors(extremoPL_femur, pF_PL).normalize());
            hazPL_femur.scale.set(1.5, distPL_f, 0.5);

            lblFemur.style.opacity = 0; lblTibia.style.opacity = 0; lblLCA.style.opacity = 0;
            matOnda.opacity = 0;
        }

        actualizarEtiqueta(lblAndamio, andamioGroup);
        actualizarEtiqueta(lblEstatica, rodillaEstaticaGroup);
        actualizarEtiqueta(lblIntratunel, andamioFemurIntra); 

        renderer.render(scene, camera);
    }

    animar();

    window.addEventListener('resize', () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    });
};