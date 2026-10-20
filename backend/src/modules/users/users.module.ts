import { Module } from '@nestjs/common';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

// User accounts. No controller: the only HTTP surface today is AuthModule
// (sign-up / sign-in / me), which uses UsersService.
@Module({
  providers: [UsersRepository, UsersService],
  exports: [UsersService],
})
export class UsersModule {}
