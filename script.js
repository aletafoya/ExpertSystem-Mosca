class Vehicle {
    motor = true;
    wheels = 0;
    doors = 0;
    type = "";
    size = "";

    constructor(motor, wheels, doors, type, size) {
        this.motor = motor;
        this.wheels = wheels;
        this.doors = doors;
        this.type = type;
        this.size = size;
    }

    setMotor(motor) {
        this.motor = motor;
    }
    setWheels(wheels) {
        this.wheels = wheels;
    }
    setDoors(doors) {
        this.doors = doors;
    }
    setType(type) {
        this.type = type;
    }
}

class ExpertSytem {
    vehicle = new Vehicle();
    rules = {};

    forwardChaining(answers) {
        
    }
    
    backwardChaining(answers) {
    
    }
}

function startReasoning() {
    const content = document.getElementById("content");
    content.innerHTML = "<div>Reasoning...</div>";
    
}