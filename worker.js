
importScripts('./lib/cannon.js');
importScripts('./lib/three.js');

var timeStep = 0.016;

function rand(min, max) {
	return Math.random() * (max - min) + min;
}

// communication with main thread
self.addEventListener('message', function(e) {

	var message = e.data;

	switch (message.action){
		case 'setup':
			setup();
			break;
		case 'updateState':
			self.postMessage({
				action: 'updateState',
				position: body.position,
				quaternion: body.quaternion,
			})
			break;
		case 'compute':
			stepCounter = 0;
			maxSteps = message.steps;
			speed = message.speed;

			body.position.set(0,5,0);
			body.shapes = [];
			shape = new CANNON.Cylinder(1,1,1/(message.ratio/2),16);
			body.addShape(shape);
			currentRatio = message.ratio;

			var rMax = 10;
			body.angularVelocity.set(rand(-rMax,rMax),rand(-rMax,rMax),rand(-rMax,rMax));
			//body.angularVelocity.set(0,rand(-rMax,rMax),0);
			var vMax = 5;
			body.velocity.set(rand(-vMax, vMax), rand(2,5), rand(-vMax, vMax));

			step();
			break;
		case 'speed':
			speed = message.speed;
			break;
		default:
			console.log('unknown message: ', message);
			break;
	}

}, false);

var world, body, shape;
var speed = 1;
var currentRatio;

function setup(){

	world = new CANNON.World();
	world.gravity.set(0,-9.81,0);
	world.broadphase = new CANNON.NaiveBroadphase();
	world.solver.iterations = 10;

	var groundBody = new CANNON.Body({
		mass: 0 // mass == 0 makes the body static
	});
	var groundShape = new CANNON.Plane();
	groundBody.addShape(groundShape);
	groundBody.quaternion.setFromEuler(-Math.PI/2,0,0, 'XYZ');
	world.addBody(groundBody);

	shape = new CANNON.Cylinder(1,1,1,16);
	body = new CANNON.Body({
		mass: 1
	});
	body.addShape(shape);
	body.position.set(0,5,0);
	//body.angularVelocity.set(0,10,0);
	//body.angularDamping = 0.5;
	world.addBody(body);

}

var stepCounter = 0;
var maxSteps = 200;


function step(){
	world.step(timeStep);

	if (stepCounter < maxSteps){
		stepCounter++;
		if (speed != 0){
			setTimeout(step,16/speed);
		}else{
			setTimeout(step(),0);
		}
	}else{

		var euler = new THREE.Euler(0,0,0, "YXZ").setFromQuaternion(new THREE.Quaternion(body.quaternion.x,body.quaternion.y,body.quaternion.z,body.quaternion.w), "YXZ");
		var isSideways = Math.abs(euler.x) > Math.PI/4;
		//console.log('%c .','font-size:100px;'+(isSideways?'background-color:green':'background-color:red'));

		var res = 1;
		if (isSideways && euler.x < 0){
			res = 0;
		}else if (isSideways && euler.x > 0){
			res = 2;
		}

		postMessage({
			action:'computeDone',
			result: res,
			ratio: currentRatio,
		})
	}

}