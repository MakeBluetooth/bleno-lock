var util = require('util');
var bleno = require('bleno');

var Gpio = require('onoff').Gpio,
    greenLed = new Gpio(23, 'out'),
    redLed = new Gpio(25, 'out'),
    lock = new Gpio(18, 'out');

var PrimaryService = bleno.PrimaryService;
var Characteristic = bleno.Characteristic;
var Descriptor = bleno.Descriptor;

var secret = '12345';

// Write the secret to this Characteristic to unlock
var UnlockCharacteristic = function() {
    UnlockCharacteristic.super_.call(this, {
      uuid: 'd271',
      properties: ['write'],
      descriptors: [
         new Descriptor({
           uuid: '2901',
           value: 'Unlock'
         })
      ]
    });
  };
util.inherits(UnlockCharacteristic, Characteristic);


UnlockCharacteristic.prototype.onWriteRequest = function(data, offset, withoutResponse, callback) {
  var status;

  if (data.toString() === secret) {
    status = 'unlocked';
    greenLed.writeSync(1);
    lock.writeSync(1);
  } else {
    status = 'invalid code';
    redLed.writeSync(1);
  }

  // reset lock and lights after 4 seconds
  setTimeout(this.reset.bind(this), 4000);

  console.log('unlock: ' + data);
  console.log('status: ' + status);

  callback(this.RESULT_SUCCESS);

  this.emit('status', status);
};

// close the lock and reset the lights
UnlockCharacteristic.prototype.reset = function() {
  this.emit('status', 'locked');
  lock.writeSync(0);
  redLed.writeSync(0);
  greenLed.writeSync(0);
}

// Current status of the lock
var StatusCharacteristic = function(unlockCharacteristic) {
    StatusCharacteristic.super_.call(this, {
      uuid: 'd272',
      properties: ['notify'],
      descriptors: [
         new Descriptor({
           uuid: '2901',
           value: 'Status Message'
         })
      ]      
    });

    unlockCharacteristic.on('status', this.onUnlockStatusChange.bind(this));
  };
util.inherits(StatusCharacteristic, Characteristic);

StatusCharacteristic.prototype.onUnlockStatusChange = function(status) {
  if (this.updateValueCallback) {
    this.updateValueCallback(new Buffer(status));
  }
};

var unlockCharacteristic = new UnlockCharacteristic();
var statusCharacteristic = new StatusCharacteristic(unlockCharacteristic);

var lockService = new PrimaryService({
  uuid: 'd270',
  characteristics: [
    unlockCharacteristic, 
    statusCharacteristic
  ]
});

bleno.on('stateChange', function(state) {
  console.log('on -> stateChange: ' + state);

  if (state === 'poweredOn') {
    bleno.startAdvertising('RPi Lock', [lockService.uuid]);
  } else {
    bleno.stopAdvertising();
  }
});

bleno.on('advertisingStart', function(error) {
  console.log('on -> advertisingStart: ' + (error ? 'error ' + error : 'success'));

  if (!error) {
    bleno.setServices([lockService]);
  }
});

// cleanup GPIO on exit
function exit() {
  greenLed.unexport();
  redLed.unexport();
  lock.unexport();
  process.exit();
}
process.on('SIGINT', exit);
