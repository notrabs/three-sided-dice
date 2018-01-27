

// worker thread stuff
var activeWorkers = 1;
var physicsWorkers = [];
var renderObjects = [];
var maxThreads = 32;

// 3d stuff
var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
camera.position.set( 10,10,10 )
camera.lookAt(0,0,0);
camera.updateProjectionMatrix();
var controls;
var renderer = new THREE.WebGLRenderer();
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
var texture = new THREE.TextureLoader().load( './textures/noisy_grid.png' );
texture.repeat.set(25,25);
texture.wrapS = THREE.RepeatWrapping;
texture.wrapT = THREE.RepeatWrapping;
var material = new THREE.MeshStandardMaterial({map: texture});
var ground = new THREE.Mesh(new THREE.BoxBufferGeometry( 500, 0.01, 500 ), material);
ground.receiveShadow = true;
scene.add(ground);
scene.add( new THREE.AmbientLight( 0xffffff, 2.0 ) );
var light = new THREE.DirectionalLight( 0xdddddd, 0.2, 100 );
light.position.set( -5, 10, -10 );
light.castShadow = true;
light.shadow.camera.zoom = 0.5;
scene.add( light );

//Set up shadow properties for the light
light.shadow.mapSize.width = 1024;  // default
light.shadow.mapSize.height = 1024; // default
light.shadow.camera.near = 0.1;    // default
light.shadow.camera.far = 200;     // default
scene.add(light);

// the simulation controller
var sim;
var secretModeApplied = false;
function Simulation() {
	var scope = this;
	this.steps = 300;
	this.ratio = (2*Math.sqrt(2)+Math.sqrt(3))/2;
	this.threads = 8;
	this.speed = 1;
	this.height = 1;
	this.binarySearch = false;
	this.binarySearchNoThrows = 1500;
	this.binarySearchLowerBound = Math.sqrt(3);
	this.binarySearchUpperBound = 2*Math.sqrt(2);
	this.secretMode = function(){
		if (!secretModeApplied){
			secretModeApplied = false;

			var tex = new THREE.TextureLoader().load( './textures/secret.jpg' );
			tex.repeat.set(25,25);
			tex.wrapS = THREE.RepeatWrapping;
			tex.wrapT = THREE.RepeatWrapping;
			material.map = tex;
		}

	};
	this['preset: halfway'] = function(){
		scope.ratio = 0.5*(2*Math.sqrt(2)+Math.sqrt(3));
	}
	this["preset: 2*sqrt(2)"] = function(){
		scope.ratio = 2*Math.sqrt(2);
	}
	this["preset: sqrt(3)"] = function(){
		scope.ratio = Math.sqrt(3);
	}
	this["preset: pi"] = function(){
		scope.ratio = 2*Math.PI; // tau is the superior constant
	}

};

var gui;
// initialization
window.onload = function() {
	sim = new Simulation();
	// GUI Setup
	gui = new dat.GUI();
	var f1 = gui.addFolder('applied in new simulation round:');
	f1.open();
	f1.add(sim, 'ratio', 0.1, 7).step(0.0001).listen();
	f1.add(sim, 'preset: sqrt(3)');
	f1.add(sim, 'preset: halfway');
	f1.add(sim, 'preset: 2*sqrt(2)');
	f1.add(sim, 'preset: pi');

	f1.add(sim, 'steps', 100, 1000).step(100).onChange(function(value){
		for (var i=0;i<activeWorkers;i++){
			physicsWorkers[i].postMessage({
				action: 'speed',
				speed: value,
			});
		}
	});
	f1.add(sim, 'threads', 1, maxThreads).step(1);

	var f3 = gui.addFolder('autoMode (binary Search)');
	f3.add(sim, 'binarySearchLowerBound', 0.1, 7).step(0.0001).listen();
	f3.add(sim, 'binarySearchUpperBound', 0.1, 7).step(0.0001).listen();
	f3.add(sim, 'binarySearchNoThrows',100,10000).step(100);
	f3.add(sim, 'binarySearch');

	var f2 = gui.addFolder('Settings:');
	f2.open();
	f2.add(sim, 'speed', { '1x': 1, '2x': 2, '4x': 4, '8x': 8, 'unlimited ( lower threads if your computer stops responding, have fun) ': 0 } ).onChange(function (value) {
		for (var i=0;i<activeWorkers;i++){
			physicsWorkers[i].postMessage({
				action: 'speed',
				speed: sim.speed,
			});
		}
	});
	f2.add(sim, 'secretMode' );
	//gui.add(sim, 'explode');

	for (var i=0;i<maxThreads;i++){

		renderObjects[i] = new THREE.Mesh(new THREE.CylinderGeometry( 1, 1, sim.height, 16 ), new THREE.MeshStandardMaterial({color: getRandomColor()}));
		renderObjects[i].position.set(0,-100,0);
		renderObjects[i].castShadow = true;
		scene.add(renderObjects[i]);

		physicsWorkers[i] = new Worker('worker.js');
		(function(i){
		physicsWorkers[i].onmessage = function(e){
			var message = e.data;

			switch (message.action){
				case 'updateState':
					renderObjects[i].position.set(message.position.x,message.position.y,message.position.z);
					var quat = new THREE.Quaternion(message.quaternion.x,message.quaternion.y,message.quaternion.z,message.quaternion.w);
					var rotation = new THREE.Euler(0,0,0,'ZYX').setFromQuaternion(quat,'ZYX');
					rotation.x += Math.PI/2;
					renderObjects[i].rotation.set(rotation.x, rotation.y, rotation.z, rotation.order);
					break;
				case 'computeDone':
					workingThreads --;
					if (currentRatio != message.ratio){
						results = [0,0,0];
						currentRatio = message.ratio;
						pipeResults = true;
					}
					results[message.result]++;
					if (workingThreads == 0){
						renderResults();
						autoMode();
						startComputeBatch();
					}
					break;
				default:
					console.log('unknown message: ', message);
					break;
			}

		}})(i);

		physicsWorkers[i].postMessage({action: 'setup'});

	}

	renderer.setSize( window.innerWidth, window.innerHeight );
	document.body.insertBefore( renderer.domElement , document.body.childNodes[0]);
	controls = new THREE.OrbitControls( camera, renderer.domElement );
	window.addEventListener( 'resize', onWindowResize, false );

	requestAnimationFrame(animate);

	startComputeBatch();

};

var results = [0,0,0];
var currentRatio;
var pipeResults = false;
var firstPipe = true;
function renderResults(){

	// cache old results
	var r1,r2,r3;
	if (pipeResults) {
		r1 = document.getElementById('currentResult').innerHTML;
		r2 = document.getElementById('lastresult0').innerHTML;
		r3 = document.getElementById('lastresult1').innerHTML;
	}

	// render new result
	var sum = results[0]+results[1]+results[2];
	document.getElementById('ratio').innerHTML = currentRatio;
	document.getElementById('results').innerHTML = (Math.round(10000*results[0]/sum)/100)+"%, "+(Math.round(10000*results[1]/sum)/100)+"%, "+(Math.round(10000*results[2]/sum)/100)+"% | "+results[0]+", "+results[1]+", "+results[2];

	if (pipeResults){
		if (!firstPipe){
			document.getElementById('lastresult0').innerHTML = r1;
			document.getElementById('lastresult1').innerHTML = r2;
			document.getElementById('lastresult2').innerHTML = r3;
		}
		firstPipe = false;
		pipeResults = false;
	}
}

function autoMode(){
	if (sim.binarySearch){
		var sum = results[0]+results[1]+results[2];
		if (sum > sim.binarySearchNoThrows){
			if (results[1]/sum > 1/3){
				sim.binarySearchLowerBound = currentRatio;
				sim.ratio = (currentRatio+sim.binarySearchUpperBound)/2;
			}else{
				sim.binarySearchUpperBound = currentRatio;
				sim.ratio = (currentRatio+sim.binarySearchLowerBound)/2;
			}
		}
	}
}

var workingThreads = 0;

function startComputeBatch(i){

	for (var i=0;i<maxThreads;i++){
		renderObjects[i].position.set(0,-100,0);
		renderObjects[i].scale.set(1,1/(sim.ratio/2),1);
	}

	activeWorkers = sim.threads;

	workingThreads = activeWorkers;

	for (var i=0;i<activeWorkers;i++){
		physicsWorkers[i].postMessage({
			action: 'compute',
			speed: sim.speed,
			steps: sim.steps,
			ratio: sim.ratio,
		});
	}
}

// Rendering stuff
function animate(){

	if (controls){
		controls.update();
	}

	for (var i=0;i<activeWorkers;i++){
		physicsWorkers[i].postMessage({
			action: 'updateState'
		});
	}

	renderer.render(scene, camera);

	requestAnimationFrame(animate);
}

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );
}

function getRandomColor() {
	var letters = '0123456789ABCDEF';
	var color = '#';
	for (var i = 0; i < 6; i++) {
		color += letters[Math.floor(Math.random() * 16)];
	}
	return color;
}