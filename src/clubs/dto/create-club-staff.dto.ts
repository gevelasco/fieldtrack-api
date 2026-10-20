import { IsEmail, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateClubStaffDto {
  @IsString()
  @MinLength(2)
  displayName: string;

  @IsEmail()
  email: string;

  @IsString()
  phone: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsObject()
  modulePermissions: Record<string, string>;
}

export class UpdateClubStaffDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  displayName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsObject()
  modulePermissions?: Record<string, string>;
}
