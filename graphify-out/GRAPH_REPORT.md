# Graph Report - .  (2026-06-03)

## Corpus Check
- 66 files · ~112,268 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 632 nodes · 1139 edges · 50 communities (30 shown, 20 thin omitted)
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 173 edges (avg confidence: 0.81)
- Token cost: 18,385 input · 4,568 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Category Management Frontend|Category Management Frontend]]
- [[_COMMUNITY_Backend API & Auth Core|Backend API & Auth Core]]
- [[_COMMUNITY_Dashboard UI Shell|Dashboard UI Shell]]
- [[_COMMUNITY_Client Management Frontend|Client Management Frontend]]
- [[_COMMUNITY_Sales & Billing Frontend|Sales & Billing Frontend]]
- [[_COMMUNITY_Dashboard Core & Navigation|Dashboard Core & Navigation]]
- [[_COMMUNITY_Membership Management Frontend|Membership Management Frontend]]
- [[_COMMUNITY_Node.js Project & Dependencies|Node.js Project & Dependencies]]
- [[_COMMUNITY_Membership API Controller|Membership API Controller]]
- [[_COMMUNITY_Client API Controller|Client API Controller]]
- [[_COMMUNITY_Product Photos Controller|Product Photos Controller]]
- [[_COMMUNITY_Membership Plans Frontend|Membership Plans Frontend]]
- [[_COMMUNITY_Sales & SUNAT Controller|Sales & SUNAT Controller]]
- [[_COMMUNITY_Product Presentations API|Product Presentations API]]
- [[_COMMUNITY_Membership Form Calculations|Membership Form Calculations]]
- [[_COMMUNITY_User Profiles Frontend|User Profiles Frontend]]
- [[_COMMUNITY_Attendance Tracking Frontend|Attendance Tracking Frontend]]
- [[_COMMUNITY_Inventory Management Frontend|Inventory Management Frontend]]
- [[_COMMUNITY_Membership Receipt & Printing|Membership Receipt & Printing]]
- [[_COMMUNITY_Membership Wizard Flow|Membership Wizard Flow]]
- [[_COMMUNITY_PWA App Manifest|PWA App Manifest]]
- [[_COMMUNITY_Membership Wizard Steps|Membership Wizard Steps]]
- [[_COMMUNITY_Membership Modal & DNI Lookup|Membership Modal & DNI Lookup]]
- [[_COMMUNITY_Membership Installments Modal|Membership Installments Modal]]
- [[_COMMUNITY_App Icon & Brand Elements|App Icon & Brand Elements]]
- [[_COMMUNITY_Volcano Gym Logo Design|Volcano Gym Logo Design]]
- [[_COMMUNITY_Protein Supplement Products|Protein Supplement Products]]
- [[_COMMUNITY_Client Photo Uploads|Client Photo Uploads]]
- [[_COMMUNITY_Profile & Permissions Views|Profile & Permissions Views]]
- [[_COMMUNITY_Client Photo Collection|Client Photo Collection]]
- [[_COMMUNITY_Category Views|Category Views]]
- [[_COMMUNITY_SUNAT Voucher Modals|SUNAT Voucher Modals]]
- [[_COMMUNITY_User Management Views|User Management Views]]
- [[_COMMUNITY_Client Photo (Chihuahua)|Client Photo (Chihuahua)]]
- [[_COMMUNITY_Client Photo Upload 4|Client Photo Upload 4]]
- [[_COMMUNITY_Client Photo Upload 5|Client Photo Upload 5]]
- [[_COMMUNITY_Client Photo (Webp)|Client Photo (Webp)]]
- [[_COMMUNITY_ReceiptVoucher Upload|Receipt/Voucher Upload]]
- [[_COMMUNITY_Product Photo (Glitch Skeleton)|Product Photo (Glitch Skeleton)]]
- [[_COMMUNITY_Product Photo (Whey Vanilla 4.8lb)|Product Photo (Whey Vanilla 4.8lb)]]
- [[_COMMUNITY_Product Photo (Whey Vanilla variant)|Product Photo (Whey Vanilla variant)]]
- [[_COMMUNITY_Sales Detail Modal|Sales Detail Modal]]
- [[_COMMUNITY_Email Sending Modal|Email Sending Modal]]
- [[_COMMUNITY_Dashboard Topbar|Dashboard Topbar]]
- [[_COMMUNITY_Attendance View|Attendance View]]
- [[_COMMUNITY_Home View|Home View]]
- [[_COMMUNITY_Login Branding Panel|Login Branding Panel]]
- [[_COMMUNITY_Login Error Warning|Login Error Warning]]
- [[_COMMUNITY_Login Form Panel|Login Form Panel]]

## God Nodes (most connected - your core abstractions)
1. `api()` - 70 edges
2. `showAlert()` - 22 edges
3. `pool` - 17 edges
4. `verificarToken()` - 16 edges
5. `Dashboard Page` - 16 edges
6. `goTo()` - 14 edges
7. `closeModal()` - 13 edges
8. `openModal()` - 12 edges
9. `loadProductos()` - 12 edges
10. `doDelete()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `openModal()` --calls--> `resetCategoriaForm()`  [INFERRED]
  src/public/js/dashboard-core.js → src/public/js/categorias.js
- `confirmarEnvioEmail()` --calls--> `api()`  [INFERRED]
  src/public/js/ventas.js → src/public/js/dashboard-core.js
- `openModal()` --calls--> `resetPlanForm()`  [INFERRED]
  src/public/js/dashboard-core.js → src/public/js/planes.js
- `loadAsistencias()` --calls--> `api()`  [INFERRED]
  src/public/js/asistencias.js → src/public/js/dashboard-core.js
- `goTo()` --calls--> `loadAsistencias()`  [INFERRED]
  src/public/js/dashboard-core.js → src/public/js/asistencias.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Venta → Comprobante → SUNAT Emission Workflow** — public_dashboard_modal_nueva_venta, public_dashboard_modal_emitir_comprobante, public_dashboard_modal_confirm_sunat [EXTRACTED 0.95]
- **Producto / Presentación / Inventario Data Lifecycle** — public_dashboard_modal_producto, public_dashboard_modal_presentacion, public_dashboard_modal_actualizar_stock [INFERRED 0.85]
- **Membresía Registration: Cliente + Plan + Pago** — public_dashboard_modal_membresia, public_dashboard_modal_cliente, public_dashboard_modal_plan [INFERRED 0.85]

## Communities (50 total, 20 thin omitted)

### Community 0 - "Category Management Frontend"
Cohesion: 0.05
Nodes (83): anularCategoria(), loadCategorias(), renderCategorias(), resetCategoriaForm(), saveCategoria(), loadClientes(), saveCliente(), api() (+75 more)

### Community 1 - "Backend API & Auth Core"
Cohesion: 0.05
Nodes (54): pool, createAsistencia(), deleteAsistencia(), getAsistencias(), getAsistenciasStats(), login(), createCategoria(), deleteCategoria() (+46 more)

### Community 2 - "Dashboard UI Shell"
Cohesion: 0.06
Nodes (27): Legal Clauses for Memberships and Clients, Membresía Wizard Modal (4-step DNI flow), Modal: Actualizar Stock por Presentación, Modal: Registro/Edición de Cliente, Modal: Confirmar Emitir tras Guardar Venta, Modal: Emitir Comprobante Electrónico, Modal: Actualizar Estado de Membresía, Modal: Nueva/Renovar Membresía (+19 more)

### Community 3 - "Client Management Frontend"
Cohesion: 0.08
Nodes (30): abrirModalAccionMemb(), _buildModalHistorial(), _calNext(), _calPrev(), _cargarHistorial(), _DIAS_EN_ES, editCliente(), _estilosHistorial() (+22 more)

### Community 4 - "Sales & Billing Frontend"
Cohesion: 0.10
Nodes (29): verBoletaVenta(), abrirModalEmitir(), abrirModalProducto(), abrirNuevaVenta(), actualizarSerieEmitir(), actualizarStatsVenta(), agregarAlCarrito(), anularVentaConfirm() (+21 more)

### Community 5 - "Dashboard Core & Navigation"
Cohesion: 0.09
Nodes (22): buildCollapsibleSection(), buildNavItem(), buildSidebar(), cap(), clientesFiltrados, closeMobileSidebar(), dataCategorias, dataClientes (+14 more)

### Community 6 - "Membership Management Frontend"
Cohesion: 0.09
Nodes (13): cargarMembresias(), cargarPlanes(), cerrarModal(), debounce(), filtrarMembresias(), filtroMembresia(), onMembFiltroChange(), _PM (+5 more)

### Community 7 - "Node.js Project & Dependencies"
Cohesion: 0.08
Nodes (25): author, dependencies, bcryptjs, cors, dotenv, express, jsonwebtoken, morgan (+17 more)

### Community 8 - "Membership API Controller"
Cohesion: 0.16
Nodes (21): addDias(), calcFechaFin(), consultarDNI(), crearMembresia(), createMembresia(), deleteMembresia(), detalleMembresia(), __dirname (+13 more)

### Community 9 - "Client API Controller"
Cohesion: 0.14
Nodes (17): cambiarEstadoCliente(), createCliente(), deleteCliente(), getClientes(), getClientesStats(), getHistorialCliente(), reactivarCliente(), updateCliente() (+9 more)

### Community 10 - "Product Photos Controller"
Cohesion: 0.14
Nodes (14): deleteFoto(), __dirname, __filename, getFotosByProducto(), reordenarFotos(), setFotoPrincipal(), UPLOAD_DIR, uploadFoto() (+6 more)

### Community 11 - "Membership Plans Frontend"
Cohesion: 0.17
Nodes (13): actualizarSimulacionInteres(), _aplicarFiltroPlanes(), editPlan(), filtrarPlanes(), filtroPlan(), _labelDuracion(), _planCard(), renderPlanes() (+5 more)

### Community 12 - "Sales & SUNAT Controller"
Cohesion: 0.23
Nodes (14): anularVenta(), buscarProductosVenta(), createVenta(), __dirname, emitirComprobante(), enviarASunat(), enviarEmailVenta(), enviarSunat() (+6 more)

### Community 13 - "Product Presentations API"
Cohesion: 0.26
Nodes (12): addPresentacionToProducto(), createPresentacion(), deletePresentacion(), deletePresentacionProducto(), getPresentaciones(), getPresentacionesActivas(), getPresentacionesByCategoria(), getPresentacionesByProducto() (+4 more)

### Community 14 - "Membership Form Calculations"
Cohesion: 0.18
Nodes (14): formatFechaCorta(), _actualizarEstadoPago1(), _actualizarMinimoHint(), actualizarResumenCuotas(), addDiasStr(), _autoSetNumCuotas(), calcularFechaFin(), cuotaRow() (+6 more)

### Community 15 - "User Profiles Frontend"
Cohesion: 0.21
Nodes (11): actualizarContadorPermisos(), openPermisos(), renderPerfiles(), renderPermisosLista(), resetForm(), resetForm_perfil(), toggleTodosPermisos(), cargarPerfilesSelect() (+3 more)

### Community 16 - "Attendance Tracking Frontend"
Cohesion: 0.27
Nodes (9): cargarAsistenciasStats(), confirmarEliminarAsist(), dataAsistencias, _eliminarAsistencia(), filtroAsistHoy(), loadAsistencias(), registrarAsistencia(), renderAsistencias() (+1 more)

### Community 17 - "Inventory Management Frontend"
Cohesion: 0.29
Nodes (7): abrirActualizarStock(), dataInventario, guardarMovimiento(), loadInventario(), renderActualizarStockHistorial(), renderActualizarStockPresentaciones(), renderInventario()

### Community 18 - "Membership Receipt & Printing"
Cohesion: 0.18
Nodes (11): _bRow(), _buildCuotasSection(), _fmtDuracion(), memb_abrirBoletaExistente(), memb_abrirVentanaImpresion(), memb_boletaContenidoInline(), memb_boletaEnviarWA(), memb_generarBoletaHTML() (+3 more)

### Community 19 - "Membership Wizard Flow"
Cohesion: 0.24
Nodes (11): wiz_actualizarMinimoHint(), wiz_actualizarResumenCuotas(), wiz_actualizarResumenPlan(), wiz_addDias(), wiz_autoSetNumCuotas(), wiz_calcFechaFin(), wiz_cuotaRow(), wiz_fmtFecha() (+3 more)

### Community 20 - "PWA App Manifest"
Cohesion: 0.18
Nodes (10): background_color, description, display, icons, name, orientation, scope, short_name (+2 more)

### Community 21 - "Membership Wizard Steps"
Cohesion: 0.39
Nodes (8): confirmarMembresia(), irPaso(), irPaso2(), irPaso3(), irPaso4(), limpiarError(), mostrarError(), wiz_mostrarExito()

### Community 22 - "Membership Modal & DNI Lookup"
Cohesion: 0.33
Nodes (7): abrirModal(), buscarDNI(), mostrarEstadoDNI(), rellenarDatosCliente(), resetearModal(), wiz_onFechaNacChange(), wiz_onMayorEdadChange()

### Community 23 - "Membership Installments Modal"
Cohesion: 0.33
Nodes (6): buildModalCuotasHTML(), _cargarHistorialMemb(), openModalCuotas(), refreshCuotas(), renderCuotasModal(), _switchTabMemb()

### Community 24 - "App Icon & Brand Elements"
Cohesion: 0.53
Nodes (6): VolcanoGym App Icon, Black and White Minimalist Style, Eruption Smoke Cloud, Human Figure Silhouette, Gym Brand Identity, Volcano Mountain Motif

### Community 25 - "Volcano Gym Logo Design"
Cohesion: 0.60
Nodes (5): Volcano Gym Brand Identity, Black and White Color Scheme, Volcano Gym Logo, Athletic Figure Silhouette, Volcano / Mountain Icon

### Community 26 - "Protein Supplement Products"
Cohesion: 0.67
Nodes (4): Optimum Nutrition (ON), Whey Protein Supplement, Optimum Nutrition Gold Standard 100% Whey Protein - Double Rich Chocolate 908g, Optimum Nutrition Gold Standard 100% Whey Protein (Double Rich Chocolate, 908g)

### Community 27 - "Client Photo Uploads"
Cohesion: 0.67
Nodes (3): Client Profile Photo (Anime Character Avatar), Anime Female Character with Red Eyes and Brown Hair, Client Uploads Directory

### Community 28 - "Profile & Permissions Views"
Cohesion: 0.67
Nodes (3): Modal: Nuevo/Editar Perfil, Modal: Asignar Permisos a Perfil, Perfiles View

## Knowledge Gaps
- **127 isolated node(s):** `name`, `version`, `description`, `main`, `type` (+122 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `api()` connect `Category Management Frontend` to `Client Management Frontend`, `Sales & Billing Frontend`, `Dashboard Core & Navigation`, `User Profiles Frontend`, `Attendance Tracking Frontend`, `Inventory Management Frontend`, `Membership Installments Modal`?**
  _High betweenness centrality (0.167) - this node is a cross-community bridge._
- **Why does `openModal()` connect `Client Management Frontend` to `Category Management Frontend`, `Membership Plans Frontend`, `Dashboard Core & Navigation`, `User Profiles Frontend`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `showAlert()` connect `Category Management Frontend` to `Inventory Management Frontend`, `Dashboard Core & Navigation`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Are the 68 inferred relationships involving `api()` (e.g. with `cargarAsistenciasStats()` and `_eliminarAsistencia()`) actually correct?**
  _`api()` has 68 INFERRED edges - model-reasoned connections that need verification._
- **Are the 21 inferred relationships involving `showAlert()` (e.g. with `saveCategoria()` and `saveCliente()`) actually correct?**
  _`showAlert()` has 21 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _127 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Category Management Frontend` be split into smaller, more focused modules?**
  _Cohesion score 0.051511758118701005 - nodes in this community are weakly interconnected._