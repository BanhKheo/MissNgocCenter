import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { networkInterfaces } from 'os';
import { Public } from './common/decorators';

/** Địa chỉ IPv4 trong mạng LAN của máy chủ, ưu tiên 192.168.x (Wi-Fi/router), rồi 10.x, rồi 172.x */
function lanAddresses() {
  const rank = (ip: string) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2);
  const all = Object.entries(networkInterfaces())
    .flatMap(([name, list]) => (list ?? []).map((a) => ({ name, ...a })))
    .filter((a) => a.family === 'IPv4' && !a.internal)
    .map((a) => ({ name: a.name, address: a.address }))
    .sort((a, b) => rank(a.address) - rank(b.address));
  // Card mạng ảo (Hyper-V, WSL, Docker, VirtualBox, VMware) điện thoại không vào được
  const real = all.filter((a) => !/vEthernet|WSL|Hyper-V|docker|br-|veth|VirtualBox|VMware|Loopback/i.test(a.name));
  return real.length > 0 ? real : all;
}

/**
 * Để web hiện mã QR "mở trên điện thoại". Chạy trong Docker thì IP container không dùng được,
 * nên đặt PUBLIC_URL (ví dụ http://192.168.1.10) trong .env.
 */
@ApiTags('health')
@Controller('server-info')
export class ServerInfoController {
  @Public()
  @Get()
  info() {
    return { publicUrl: process.env.PUBLIC_URL || null, addresses: lanAddresses() };
  }
}
