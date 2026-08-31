import { Printer } from '../src/Printer';

const printer = new Printer({ target: 'TCP:192.168.1.50', deviceName: 'TM-T88V' });

// @ts-expect-error addText lives on the Command Buffer, not Printer
printer.addText('hello');
