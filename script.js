/* Expert System mejorado según solicitud:
   - RuleBase select para elegir entre 'vehicles' y 'dogs'
   - Goal se llena dinámicamente con las conclusiones de la KB seleccionada
   - Data->Load pregunta solo atributos de la KB seleccionada
   - Forward usa solo reglas de la KB seleccionada
   - Backward usa el Goal (conclusión específica) para intentar probarla
*/

//////////////////////
// Knowledge (Rules) //
//////////////////////

const vehicleRules = [
  { domain: "vehicle", name: "Bicycle", if: { vehicleType: "cycle", num_wheels: 2, motor: "no" }, then: { vehicle: "Bicycle" } },
  { domain: "vehicle", name: "Tricycle", if: { vehicleType: "cycle", num_wheels: 3, motor: "no" }, then: { vehicle: "Tricycle" } },
  { domain: "vehicle", name: "Motorcycle", if: { vehicleType: "cycle", num_wheels: 2, motor: "yes" }, then: { vehicle: "Motorcycle" } },
  { domain: "vehicle", name: "SportsCar", if: { vehicleType: "automobile", size: "small", num_doors: 2 }, then: { vehicle: "Sports Car" } },
  { domain: "vehicle", name: "Sedan", if: { vehicleType: "automobile", size: "medium", num_doors: 4 }, then: { vehicle: "Sedan" } },
  { domain: "vehicle", name: "MiniVan", if: { vehicleType: "automobile", size: "medium", num_doors: 3 }, then: { vehicle: "MiniVan" } },
  { domain: "vehicle", name: "SUV", if: { vehicleType: "automobile", size: "large", num_doors: 4 }, then: { vehicle: "SUV" } },
  // utility rules to infer vehicleType
  { domain: "vehicle", name: "CycleType", if: { num_wheels: "<4" }, then: { vehicleType: "cycle" } },
  { domain: "vehicle", name: "AutomobileType", if: { num_wheels: 4, motor: "yes" }, then: { vehicleType: "automobile" } },
];

const dogRules = [
  { domain: "dog", name: "Chihuahua", if: { domain: "dog", size: "small", fur_length: "short", tail_length: "short" }, then: { breed: "Chihuahua" } },
  { domain: "dog", name: "Beagle", if: { domain: "dog", size: "medium", barking: "yes", fur_length: "short" }, then: { breed: "Beagle" } },
  { domain: "dog", name: "SaintBernard", if: { domain: "dog", size: "large", fur_length: "long", working: "yes" }, then: { breed: "Saint Bernard" } },
  { domain: "dog", name: "Dalmatian", if: { domain: "dog", size: "large", spots: "yes", fur_length: "short" }, then: { breed: "Dalmatian" } },
];

const RULES_ALL = [...vehicleRules, ...dogRules];

/////////////////////////
// Working structures  //
/////////////////////////

let workingMemory = {};   // facts
let firedRules = new Set();
let dataLoaded = false;
let currentKB = null;     // 'vehicle' or 'dog' (set via rulebase select)

const traceArea = document.getElementById("traceArea");
const resultField = document.getElementById("resultField");
const goalSelect = document.getElementById("goal");

/////////////////////
// Helpers & Modal //
/////////////////////

function appendTrace(line = "") {
  traceArea.value += line + "\n";
  traceArea.scrollTop = traceArea.scrollHeight;
}

function resetTraceAndResult() {
  traceArea.value = "";
  resultField.value = "";
}

function clearAll() {
  workingMemory = {};
  firedRules.clear();
  dataLoaded = false;
  resetTraceAndResult();
}

function matchClause(factsVal, expected) {
  if (expected === null || expected === undefined) return false;
  if (typeof expected === "string" && expected.startsWith("<")) {
    const num = parseFloat(expected.slice(1));
    return (typeof factsVal === "number" || !isNaN(parseFloat(factsVal))) && Number(factsVal) < num;
  }
  if (typeof expected === "string" && expected.startsWith(">")) {
    const num = parseFloat(expected.slice(1));
    return (typeof factsVal === "number" || !isNaN(parseFloat(factsVal))) && Number(factsVal) > num;
  }
  return String(factsVal) === String(expected);
}

function getRulesForKB(kb) {
  if (!kb) return [];
  return RULES_ALL.filter(r => r.domain === kb);
}

// Modal for attribute asking
function askAttributeModal(attrName, inputType = "text", options = null) {
  return new Promise((resolve) => {
    const backdrop = document.getElementById("modalBackdrop");
    const title = document.getElementById("modalTitle");
    const body = document.getElementById("modalBody");
    const okBtn = document.getElementById("modalOkBtn");
    const skipBtn = document.getElementById("modalSkipBtn");
    const cancelBtn = document.getElementById("modalCancelBtn");

    title.innerText = `Valor de "${attrName}"`;
    body.innerHTML = "";

    const fieldDiv = document.createElement("div");
    fieldDiv.className = "field";

    let inputEl;
    if (options && Array.isArray(options)) {
      inputEl = document.createElement("select");
      const emptyOpt = document.createElement("option");
      emptyOpt.value = "";
      emptyOpt.text = "-- seleccionar --";
      inputEl.appendChild(emptyOpt);
      options.forEach(o => {
        const opt = document.createElement("option");
        opt.value = o;
        opt.text = o;
        inputEl.appendChild(opt);
      });
    } else {
      inputEl = document.createElement("input");
      inputEl.type = inputType === "number" ? "number" : "text";
      inputEl.placeholder = "(dejar vacío = saltar)";
    }
    inputEl.id = "modalInput";
    fieldDiv.appendChild(inputEl);
    body.appendChild(fieldDiv);

    backdrop.classList.remove("hidden");

    function cleanup() {
      okBtn.removeEventListener("click", okHandler);
      skipBtn.removeEventListener("click", skipHandler);
      cancelBtn.removeEventListener("click", cancelHandler);
      backdrop.classList.add("hidden");
    }

    function okHandler() {
      let v = inputEl.value;
      if (v === "") { cleanup(); resolve(null); return; }
      if (inputType === "number" && !isNaN(Number(v))) v = Number(v);
      cleanup();
      resolve(v);
    }
    function skipHandler() { cleanup(); resolve(null); }
    function cancelHandler() { cleanup(); resolve(undefined); }

    okBtn.addEventListener("click", okHandler);
    skipBtn.addEventListener("click", skipHandler);
    cancelBtn.addEventListener("click", cancelHandler);

    setTimeout(() => inputEl.focus(), 40);
  });
}

/////////////////////
// RuleBase select //
/////////////////////

function handleRulebaseMenu(value) {
  if (value === "none") return;
  if (value === "vehicles") currentKB = "vehicle";
  else if (value === "dogs") currentKB = "dog";
  else currentKB = null;

  // reset work and traces when changing KB
  clearAll();
  appendTrace(`RuleBase seleccionado: ${currentKB || "none"}`);

  // update goal options for the selected KB
  updateGoalOptions();

  // reset select back to placeholder (so user can reselect later if wanted)
  document.getElementById("rulebaseMenu").value = value;
}

function updateGoalOptions() {
  goalSelect.innerHTML = "";
  if (!currentKB) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.text = "-- Seleccione RuleBase primero --";
    goalSelect.appendChild(opt);
    return;
  }
  // collect distinct then-values from rules of the KB
  const rules = getRulesForKB(currentKB);
  const conclusions = new Map(); // key: "var:value" -> display
  rules.forEach(r => {
    Object.entries(r.then).forEach(([k, v]) => {
      conclusions.set(`${k}:${v}`, { key: k, value: v });
    });
  });

  // populate select
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.text = `-- Seleccione objetivo (${currentKB}) --`;
  goalSelect.appendChild(placeholder);

  for (let [kv, obj] of conclusions) {
    const opt = document.createElement("option");
    opt.value = kv; // e.g. "vehicle:MiniVan" or "breed:Beagle"
    opt.text = obj.value; // show result name
    goalSelect.appendChild(opt);
  }
}

/////////////////////
// Data Load Flow  //
/////////////////////

async function handleDataMenu(value) {
  if (value !== "load") return;
  if (!currentKB) {
    alert("Seleccione primero la RuleBase (Vehicles o Dogs).");
    return;
  }

  // ask only attributes relevant to the selected KB
  if (currentKB === "vehicle") {
    appendTrace("Cargando datos (vehicle)...");
    const num_wheels = await askAttributeModal("num_wheels (ej: 2,3,4)", "number");
    const motor = await askAttributeModal("motor (yes/no)", "text", ["yes", "no"]);
    const num_doors = await askAttributeModal("num_doors (ej: 2,3,4)", "number");
    const size = await askAttributeModal("size (small/medium/large)", "text", ["small", "medium", "large"]);
    const vehicleType = await askAttributeModal("vehicleType (cycle/automobile) (opcional)", "text", ["cycle", "automobile"]);

    if (num_wheels !== null) workingMemory.num_wheels = num_wheels;
    if (motor !== null) workingMemory.motor = motor;
    if (num_doors !== null) workingMemory.num_doors = num_doors;
    if (size !== null) workingMemory.size = size;
    if (vehicleType !== null) workingMemory.vehicleType = vehicleType;

    appendTrace("Datos cargados (vehicle): " + JSON.stringify(workingMemory));
    dataLoaded = true;
  } else if (currentKB === "dog") {
    appendTrace("Cargando datos (dog)...");
    const size = await askAttributeModal("size (small/medium/large)", "text", ["small", "medium", "large"]);
    const fur_length = await askAttributeModal("fur_length (short/long)", "text", ["short", "long"]);
    const barking = await askAttributeModal("barking (yes/no)", "text", ["yes", "no"]);
    const working = await askAttributeModal("working (yes/no)", "text", ["yes", "no"]);
    const spots = await askAttributeModal("spots (yes/no)", "text", ["yes", "no"]);
    const tail_length = await askAttributeModal("tail_length (short/long)", "text", ["short", "long"]);

    if (size !== null) workingMemory.size = size;
    if (fur_length !== null) workingMemory.fur_length = fur_length;
    if (barking !== null) workingMemory.barking = barking;
    if (working !== null) workingMemory.working = working;
    if (spots !== null) workingMemory.spots = spots;
    if (tail_length !== null) workingMemory.tail_length = tail_length;
    workingMemory.domain = "dog";

    appendTrace("Datos cargados (dog): " + JSON.stringify(workingMemory));
    dataLoaded = true;
  }
  document.getElementById("dataMenu").value = "data";
}

/////////////////////
// Forward chaining //
/////////////////////

function canFireRule(rule, facts) {
  for (let [k, v] of Object.entries(rule.if)) {
    if (!(k in facts)) return false; // antecedent missing => cannot fire
    const fv = facts[k];
    if (!matchClause(fv, v)) return false;
  }
  return true;
}

function forwardChaining() {
  if (!currentKB) {
    appendTrace("Error: No hay RuleBase seleccionada.");
    alert("Seleccione RuleBase (Vehicles o Dogs) primero.");
    return;
  }
  if (!dataLoaded) {
    appendTrace("Error: debe cargar datos primero (Data → Load) para forward chaining.");
    alert("Para forward chaining debes hacer Data → Load antes de Start.");
    return;
  }

  appendTrace("=== Forward chaining: inicio ===");
  const rules = getRulesForKB(currentKB);
  let firedSomething = true;

  while (firedSomething) {
    firedSomething = false;
    for (let rule of rules) {
      if (firedRules.has(rule.name)) continue;
      if (canFireRule(rule, workingMemory)) {
        appendTrace(`Firing rule: ${rule.name}`);
        for (let [k, v] of Object.entries(rule.then)) {
          if (!(k in workingMemory)) {
            workingMemory[k] = v;
            appendTrace(`  Added fact: ${k} = ${v}`);
          } else {
            appendTrace(`  Fact ${k} already present (${workingMemory[k]})`);
          }
        }
        firedRules.add(rule.name);
        firedSomething = true;
        break;
      }
    }
  }

  appendTrace("=== Forward chaining: fin ===");
  // set resultField according to KB
  if (currentKB === "vehicle") resultField.value = (workingMemory.vehicle ?? "null");
  else if (currentKB === "dog") resultField.value = (workingMemory.breed ?? "null");
}

/////////////////////
// Backward chaining //
/////////////////////

async function backwardChainingGoal(goalKv) {
  if (!currentKB) {
    appendTrace("Error: No hay RuleBase seleccionada.");
    alert("Seleccione RuleBase (Vehicles o Dogs) primero.");
    return null;
  }
  if (!goalKv) {
    appendTrace("No hay Goal seleccionado.");
    alert("Elija un Goal (objetivo) para backward chaining.");
    return null;
  }
  // parse goalKv -> "key:value"
  const [goalKey, ...rest] = goalKv.split(":");
  const goalValue = rest.join(":");

  appendTrace(`=== Backward chaining: goal = ${goalKey} = ${goalValue} ===`);
  const rules = getRulesForKB(currentKB);
  // find rules that conclude exactly goalKey=goalValue
  const candidateRules = rules.filter(r => {
    return Object.entries(r.then).some(([k, v]) => (k === goalKey && String(v) === String(goalValue)));
  });
  appendTrace(`Candidate rules for goal: ${candidateRules.map(r=>r.name).join(", ") || "none"}`);

  // attempt to prove: depth-first
  for (let rule of candidateRules) {
    appendTrace(`Trying rule ${rule.name} with antecedents ${JSON.stringify(rule.if)}`);
    let allTrue = true;
    // for each antecedent check if known/matches or ask user / try to prove recursively (simple approach: ask user)
    for (let [ak, av] of Object.entries(rule.if)) {
      if (ak in workingMemory && matchClause(workingMemory[ak], av)) {
        appendTrace(`  Antecedent ${ak} already known and matches (${workingMemory[ak]})`);
        continue;
      }
      if (ak in workingMemory && !matchClause(workingMemory[ak], av)) {
        appendTrace(`  Antecedent ${ak} known (${workingMemory[ak]}) but does NOT match required (${av}). Rule fails.`);
        allTrue = false;
        break;
      }
      // unknown - ask user
      appendTrace(`  Asking user for '${ak}' (needed=${av})`);
      let opts = null;
      let inputType = "text";
      if (ak.includes("num") || ak.includes("wheels") || ak.includes("doors")) inputType = "number";
      if (ak === "motor" || ak === "barking" || ak === "working" || ak === "spots") opts = ["yes","no"];
      if (ak === "size") opts = ["small","medium","large"];
      if (ak === "fur_length" || ak === "tail_length") opts = ["short","long"];
      if (ak === "vehicleType") opts = ["cycle","automobile"];
      if (ak === "domain") opts = ["dog","vehicle"];

      const userVal = await askAttributeModal(ak, inputType, opts);
      if (userVal === undefined) {
        appendTrace("  Usuario canceló. Abortando backward.");
        return null;
      }
      if (userVal === null) {
        appendTrace(`  Usuario saltó '${ak}' -> valor nulo. Regla no satisfecha.`);
        workingMemory[ak] = null;
        allTrue = false;
        break;
      }
      workingMemory[ak] = userVal;
      appendTrace(`  Usuario respondió: ${ak} = ${userVal}`);
      if (!matchClause(workingMemory[ak], av)) {
        appendTrace(`  Pero ${ak}=${userVal} NO coincide con requerido ${av}.`);
        allTrue = false;
        break;
      } else {
        appendTrace(`  ${ak} coincide con ${av}.`);
      }
    }

    if (allTrue) {
      appendTrace(`  Regla ${rule.name} satisfactoria. Disparando.`);
      for (let [k, v] of Object.entries(rule.then)) {
        workingMemory[k] = v;
        appendTrace(`    Hecho inferido: ${k} = ${v}`);
      }
      appendTrace(`Goal probado: ${goalKey} = ${goalValue}`);
      return goalValue;
    } else {
      appendTrace(`  Regla ${rule.name} falló. Probando siguiente.`);
    }
  }

  appendTrace(`No se pudo probar el goal ${goalKey}=${goalValue}.`);
  return null;
}

/////////////////////
// File menu handlers //
/////////////////////

function handleFileMenu(value) {
  if (value === "start") {
    startReasoning();
  } else if (value === "restart") {
    if (confirm("¿Borrar datos y reiniciar?")) {
      clearAll();
    }
  } else if (value === "exit") {
    appendTrace("Exit selected. Intentando cerrar ventana...");
    try { window.close(); }
    catch (e) { /* ignore */ }
    setTimeout(() => { if (!window.closed) alert("No se pudo cerrar la ventana desde el navegador. Por favor cierre la pestaña manualmente."); }, 200);
  }
  document.getElementById("fileMenu").value = "file";
}

/////////////////////
// Start reasoning //
/////////////////////

async function startReasoning() {
  const mode = document.querySelector('input[name="mode"]:checked').value;

  appendTrace(`=== START invoked (mode=${mode}, KB=${currentKB}) ===`);

  if (!currentKB) {
    alert("Seleccione la RuleBase (Vehicles o Dogs) antes de iniciar.");
    return;
  }

  if (mode === "forward") {
    forwardChaining();
  } else {
    // backward: use Goal select which is a "key:value" string
    const goalKv = goalSelect.value;
    if (!goalKv) {
      alert("Seleccione un Goal para backward chaining (desplegable Goal).");
      return;
    }
    const res = await backwardChainingGoal(goalKv);
    resultField.value = (res === null || res === undefined) ? "null" : res;
  }

  // If forward, resultField already set by forwardChaining
  if (mode === "forward") {
    if (currentKB === "vehicle") resultField.value = (workingMemory.vehicle ?? "null");
    else if (currentKB === "dog") resultField.value = (workingMemory.breed ?? "null");
  }

  appendTrace("=== END START ===\n");
}

// attach to global
window.handleFileMenu = handleFileMenu;
window.handleDataMenu = handleDataMenu;
window.handleRulebaseMenu = handleRulebaseMenu;
window.startReasoning = startReasoning;

// Initialize UI
appendTrace("Sistema experto listo. Seleccione RuleBase (Vehicles o Dogs). Luego Data → Load para forward, o elija backward con un Goal.");
updateGoalOptions();
